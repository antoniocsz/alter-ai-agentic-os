import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { startRun, updateRun, appendRunEvent, finishRun, getRun } from './runs.js'

/**
 * Runner de agentes (feature `execucao-agentes`, task 94).
 *
 * Executa uma tool (claude/codex/opencode) de verdade, em modo não interativo,
 * dentro da worktree da task, e grava cada linha da saída estruturada como evento
 * normalizado (`lib/runs.js`). Nada é simulado: tool ausente → erro antes de abrir run.
 *
 * Contrato do driver (`lib/runtimes/<tool>.js`):
 *   id, bin, installHint
 *   command(opts) → string[]            args fixos (o prompt vai por stdin)
 *   normalize(obj) → { events: [{type, payload, native}], meta? }
 *     meta: { sessionId?, model?, usage?: {tokensIn, tokensOut, costUsd}, final?: { ok, reason? } }
 */

// Args que chegam ao spawn: tokens simples. No Windows a tool é um .cmd e o spawn
// usa shell — por isso NADA com espaço/metacaractere entra em argv (o prompt vai por stdin).
const SAFE_ARG = /^[A-Za-z0-9._:/@=-]+$/

export function assertSafeArgs(args) {
  for (const a of args) {
    if (!SAFE_ARG.test(a)) throw new Error(`argumento inseguro para o runtime: ${JSON.stringify(a)}`)
  }
  return args
}

/**
 * Procura `bin` no PATH. Windows: respeita PATHEXT (.exe/.cmd/.bat); `.cmd/.bat`
 * exigem shell. Retorna `{ file, shell }` ou `null`.
 */
export function resolveExecutable(bin, { env = process.env, platform = process.platform } = {}) {
  const sep = platform === 'win32' ? ';' : ':'
  const dirs = String(env.PATH ?? env.Path ?? '').split(sep).filter(Boolean)
  const exts =
    platform === 'win32'
      ? String(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).map((e) => e.toLowerCase())
      : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const file = path.join(dir, bin + ext)
      try {
        const st = fs.statSync(file)
        if (!st.isFile()) continue
        if (platform !== 'win32' && (st.mode & 0o111) === 0) continue
        return { file, shell: platform === 'win32' && /\.(cmd|bat)$/i.test(ext) }
      } catch {}
    }
  }
  return null
}

function spawnArgs(exe, args) {
  // shell:true concatena com espaço; caminho com espaço (Program Files) precisa de aspas.
  const file = exe.shell && /\s/.test(exe.file) ? `"${exe.file}"` : exe.file
  return [file, assertSafeArgs(args)]
}

/** Versão da tool (`<bin> --version`), ou null — nunca bloqueia o run. */
export function toolVersion(exe, { env = process.env } = {}) {
  try {
    const [file, args] = spawnArgs(exe, ['--version'])
    const out = execFileSync(file, args, { env, shell: exe.shell, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] })
    return out.trim().split('\n')[0].slice(0, 80) || null
  } catch {
    return null
  }
}

/** Encerra o processo e seus filhos (Windows: taskkill /T; POSIX: grupo do processo). */
export function killTree(pid, { platform = process.platform } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    if (platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        process.kill(pid, 'SIGTERM')
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Interrompe um run em andamento a partir de outro processo (`harness run --stop`).
 * O processo dono do run percebe a saída do filho e não sobrescreve o status.
 */
export function stopRun(db, runId) {
  const run = getRun(db, runId)
  if (!run) throw new Error(`run não encontrado: ${runId}`)
  if (run.status !== 'running') return { ok: false, reason: `run já terminou (${run.status})` }
  const killed = killTree(run.pid)
  finishRun(db, runId, { status: 'failed', error: 'interrupted' })
  appendRunEvent(db, runId, { type: 'run.failed', payload: { reason: 'interrupted', by: 'stop', killed } })
  return { ok: true, killed }
}

const STDERR_TAIL = 4000

/**
 * Executa `driver` com `prompt` (via stdin) em `cwd`, gravando o run em `db`.
 * Resolve com `{ runId, status, exitCode, error }`. `signal` (AbortSignal) interrompe.
 */
export function runTool({ db, taskId, cwd, driver, prompt, opts = {}, env = process.env, signal = null, onEvent = () => {}, unsafe = false, batchId = null }) {
  const exe = resolveExecutable(driver.bin, { env })
  if (!exe) throw new Error(`${driver.bin} não encontrado no PATH.\n  ${driver.installHint}`)
  if (!fs.existsSync(cwd)) throw new Error(`diretório de execução não existe: ${cwd}`)

  const version = toolVersion(exe, { env })
  const [file, args] = spawnArgs(exe, driver.command(opts))

  const child = spawn(file, args, {
    cwd,
    env,
    shell: exe.shell,
    detached: process.platform !== 'win32', // grupo próprio → killTree derruba os filhos
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })

  const runId = startRun(db, {
    taskId,
    tool: driver.id,
    toolVersion: version,
    model: opts.model ?? null,
    pid: child.pid ?? null,
    cwd,
    unsafe,
    batchId
  })

  const record = (ev) => {
    appendRunEvent(db, runId, ev)
    try {
      onEvent({ ...ev, runId })
    } catch {}
  }

  let usage = null
  let final = null
  let interrupted = false
  let stderr = ''
  let buffer = ''

  const handleLine = (line) => {
    const text = line.replace(/\r$/, '')
    if (!text.trim()) return
    let obj
    try {
      obj = JSON.parse(text)
    } catch {
      record({ type: 'agent.message', payload: { text }, native: text })
      return
    }
    let out
    try {
      out = driver.normalize(obj) ?? { events: [] }
    } catch (err) {
      out = { events: [{ type: 'agent.message', payload: { text: `evento não normalizado: ${err.message}` }, native: obj }] }
    }
    const meta = out.meta ?? {}
    if (meta.sessionId || meta.model) updateRun(db, runId, { sessionId: meta.sessionId, model: meta.model })
    if (meta.usage) usage = meta.usage
    if (meta.final) final = meta.final
    for (const ev of out.events ?? []) record(ev)
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL)
  })

  const onAbort = () => {
    interrupted = true
    killTree(child.pid)
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  child.stdin.on('error', () => {}) // tool que fecha stdin cedo não derruba o harness
  child.stdin.end(prompt)

  return new Promise((resolve) => {
    let settled = false
    const settle = (exitCode, spawnError = null) => {
      if (settled) return
      settled = true
      if (buffer.trim()) handleLine(buffer)
      buffer = ''
      signal?.removeEventListener?.('abort', onAbort)

      // `harness run --stop` de outro processo já fechou o run: não sobrescrever.
      const current = getRun(db, runId)
      if (current && current.status !== 'running') {
        resolve({ runId, status: current.status, exitCode, error: current.error })
        return
      }

      let status = 'completed'
      let error = null
      if (interrupted) {
        status = 'failed'
        error = 'interrupted'
      } else if (spawnError) {
        status = 'failed'
        error = spawnError.message
      } else if (exitCode !== 0) {
        status = 'failed'
        error = stderr.trim() || `${driver.bin} saiu com código ${exitCode}`
      } else if (final && final.ok === false) {
        status = 'failed'
        error = final.reason ?? 'o runtime reportou erro'
      }

      finishRun(db, runId, { status, exitCode, usage, error })
      record(
        status === 'completed'
          ? { type: 'run.completed', payload: { exit_code: exitCode } }
          : { type: 'run.failed', payload: { reason: error, exit_code: exitCode } }
      )
      resolve({ runId, status, exitCode, error })
    }
    child.on('error', (err) => settle(null, err))
    child.on('close', (code) => settle(code))
  })
}
