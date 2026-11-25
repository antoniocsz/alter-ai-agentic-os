import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { startRun, updateRun, appendRunEvent, finishRun, getRun } from './runs.js'
import { harvestRunMemories } from './memories.js'
import { runGatesAsync, qualityOf } from './gates.js'

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
  const safe = assertSafeArgs(args)
  if (!exe.shell) return [exe.file, safe]
  // shell:true (.cmd no Windows): a linha de comando é montada aqui — os args já passaram por
  // assertSafeArgs — em vez de passar array + shell (Node 22 avisa DEP0190). Caminho com espaço
  // (Program Files) vai entre aspas.
  const file = /\s/.test(exe.file) ? `"${exe.file}"` : exe.file
  return [[file, ...safe].join(' '), []]
}

/**
 * Ambiente do filho: `PWD` = cwd do run. Validação real (task 113): chamado do Git Bash, o
 * filho herdava `PWD=/d/projetos` e o opencode tentava entrar nesse diretório em vez da worktree.
 */
export function childEnv(env, cwd) {
  return { ...env, PWD: cwd }
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
export function runTool({ db, taskId, cwd, driver, prompt, opts = {}, env = process.env, signal = null, onEvent = () => {}, unsafe = false, batchId = null, limit = null, budgetOverride = false, rawLog = null, onStart = null, gates = null }) {
  const exe = resolveExecutable(driver.bin, { env })
  if (!exe) throw new Error(`${driver.bin} não encontrado no PATH.\n  ${driver.installHint}`)
  if (!fs.existsSync(cwd)) throw new Error(`diretório de execução não existe: ${cwd}`)

  const version = toolVersion(exe, { env })
  const [file, args] = spawnArgs(exe, driver.command(opts))

  const child = spawn(file, args, {
    cwd,
    env: childEnv(env, cwd),
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
    batchId,
    budgetOverride
  })
  // API local (task 115): o chamador conhece o id antes do fim (responde 202 com ele).
  try {
    onStart?.(runId)
  } catch {}

  let lastAgentError = null
  const record = (ev) => {
    if (ev.type === 'agent.error' && ev.payload?.reason) lastAgentError = String(ev.payload.reason)
    appendRunEvent(db, runId, ev)
    try {
      onEvent({ ...ev, runId })
    } catch {}
  }

  let usage = null
  let partial = null
  let overBudget = null
  let final = null

  // Orçamento (task 107): uso reportado até agora (total da tool, senão parcial) acima do limite
  // efetivo → encerra a árvore e o run termina `failed` com motivo `budget`.
  const checkLimit = () => {
    if (!limit || overBudget) return
    const current = usage ?? partial
    if (!current) return
    const tokens = (current.tokensIn ?? 0) + (current.tokensOut ?? 0)
    let hit = null
    if (limit.tokens !== null && limit.tokens !== undefined && tokens > limit.tokens) hit = { metric: 'tokens', used: tokens, limit: limit.tokens }
    else if (limit.usd !== null && limit.usd !== undefined && current.costUsd !== null && current.costUsd !== undefined && current.costUsd > limit.usd) {
      hit = { metric: 'usd', used: current.costUsd, limit: limit.usd }
    }
    if (!hit) return
    overBudget = hit
    record({ type: 'agent.error', payload: { reason: `orçamento excedido: ${hit.metric} ${hit.used} > ${hit.limit}`, budget: hit } })
    killTree(child.pid)
  }
  let interrupted = false
  let stderr = ''
  let buffer = ''

  // Captura bruta (task 111): cada linha exatamente como a tool emitiu, para diagnóstico de formato.
  // Sem redaction — o arquivo é local e o usuário é avisado.
  const raw = (prefix, text) => {
    if (!rawLog) return
    try {
      fs.appendFileSync(rawLog, prefix ? `${prefix}${text}\n` : `${text}\n`)
    } catch {}
  }
  if (rawLog) {
    fs.mkdirSync(path.dirname(rawLog), { recursive: true })
    fs.writeFileSync(rawLog, '')
  }

  const handleLine = (line) => {
    raw('', line.replace(/\r$/, ''))
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
    if (meta.partialUsage) partial = meta.partialUsage
    if (meta.final) final = meta.final
    for (const ev of out.events ?? []) record(ev)
    checkLimit()
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
    if (rawLog) {
      try {
        fs.appendFileSync(rawLog + '.stderr', chunk)
      } catch {}
    }
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
      if (overBudget) {
        status = 'failed'
        error = `budget: ${overBudget.metric} ${overBudget.used} > limite ${overBudget.limit}`
      } else if (interrupted) {
        status = 'failed'
        error = 'interrupted'
      } else if (spawnError) {
        status = 'failed'
        error = spawnError.message
      } else if (exitCode !== 0) {
        status = 'failed'
        error = stderr.trim() || (lastAgentError && `${driver.bin}: ${lastAgentError}`) || `${driver.bin} saiu com código ${exitCode}`
      } else if (final && final.ok === false) {
        status = 'failed'
        error = final.reason ?? 'o runtime reportou erro'
      }

      // Sem total final (run cortado antes do `result`), o parcial REPORTADO pela tool é o registro.
      finishRun(db, runId, { status, exitCode, usage: usage ?? partial, error })
      record(
        status === 'completed'
          ? { type: 'run.completed', payload: { exit_code: exitCode } }
          : { type: 'run.failed', payload: { reason: overBudget ? 'budget' : error, detail: overBudget ? error : undefined, exit_code: exitCode } }
      )
      // Memória em níveis (task 119): bloco `MEMÓRIA:` do agente → memórias propostas.
      let memories = []
      if (status === 'completed') {
        try {
          memories = harvestRunMemories(db, runId)
        } catch {}
      }
      const done = { runId, status, exitCode, error, memories: memories.length }
      // Qualidade (task 128): gates de `harness.json → gates.run` na worktree, depois do run concluído.
      if (status !== 'completed' || !gates?.list?.length) return resolve(done)
      runGatesAsync(cwd, gates.list, { strict: gates.strict, env })
        .then((results) => {
          for (const r of results) {
            try {
              record({ type: 'quality.gate', payload: { gate: r.gate, status: r.status, reason: r.reason ?? null, output: r.output ? String(r.output).slice(-2000) : null } })
            } catch {}
          }
          const quality = qualityOf(results)
          try {
            db.prepare('UPDATE runs SET quality = ? WHERE id = ?').run(quality, runId)
          } catch {}
          resolve({ ...done, quality, gates: results })
        })
        .catch(() => resolve(done))
    }
    child.on('error', (err) => settle(null, err))
    child.on('close', (code) => settle(code))
  })
}
