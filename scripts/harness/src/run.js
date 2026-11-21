import fs from 'node:fs'
import path from 'node:path'
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { activeDir, resolveTaskName } from './lib/tasks.js'
import { readRegistry } from './lib/worktree.js'
import { runTool, stopRun } from './lib/runner.js'
import { reapOrphans } from './lib/runs.js'
import * as claude from './lib/runtimes/claude.js'
import * as codex from './lib/runtimes/codex.js'
import * as opencode from './lib/runtimes/opencode.js'

/** Drivers disponíveis para `--tool`. Drivers com `create()` guardam estado por run. */
export const DRIVERS = { claude, codex, opencode }

export function driverFor(toolName) {
  const mod = DRIVERS[toolName]
  if (!mod) return null
  return typeof mod.create === 'function' ? mod.create() : mod
}

const SAFE_VALUE = /^[A-Za-z0-9._:/@-]+$/

const USAGE = `uso: harness run <task> --tool <${Object.keys(DRIVERS).join('|')}> [--model <m>] [--permission-mode <modo>] [--unsafe]
     harness run --stop <run>`

/** Worktree registrada da task (exigida: o agente nunca roda na árvore principal). */
export function taskWorktree(root, taskId) {
  const entry = readRegistry(root).worktrees.find((w) => w.task === taskId)
  if (!entry) return null
  const dir = path.resolve(root, entry.path)
  return fs.existsSync(dir) ? { ...entry, dir } : null
}

export function buildPrompt(taskId, taskBody, wt) {
  return [
    `Você está executando a task ${taskId} do harness (AlterAI - Agentic OS)`,
    `na worktree ${wt.path} (branch ${wt.branch}). Regras desta execução:`,
    '- Leia AGENTS.md e siga o protocolo e os guard rails do projeto.',
    '- Toque SOMENTE os arquivos listados em "## Escopo" da task.',
    '- NÃO rode `harness finish`, `harness worktree finish`, merge, push nem comandos git que reescrevem histórico ou descartam mudanças — a integração é feita fora desta execução.',
    '- Ao terminar, responda com um resumo curto: o que foi feito, pendências e decisões.',
    '',
    '--- TASK ---',
    taskBody
  ].join('\n')
}

function line(text) {
  process.stdout.write(text + '\n')
}

const oneLine = (s, max = 110) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function printEvent(ev) {
  const p = ev.payload ?? {}
  switch (ev.type) {
    case 'run.started':
      line(`   sessão ${p.session_id ?? 'n/d'}${p.model ? ` · ${p.model}` : ''}`)
      break
    case 'agent.message':
      if (p.text && !p.final) line(`   💬 ${oneLine(p.text)}`)
      break
    case 'agent.tool_call':
      line(`   🔧 ${p.name ?? 'tool'}${p.input ? ` ${oneLine(p.input.command ?? p.input.file_path ?? p.input.pattern ?? '', 90)}` : ''}`)
      break
    case 'agent.tool_result':
      if (p.is_error) line(`   ⚠️  erro de ferramenta: ${oneLine(p.text, 90)}`)
      break
    case 'agent.file_changed':
      line(`   📝 ${p.path}`)
      break
    case 'agent.error':
      line(`   ❌ ${oneLine(p.reason)}`)
      break
    default:
      break
  }
}

function fmtUsage(run) {
  if (!run) return ''
  const n = (v) => (v === null || v === undefined ? 'n/d' : v)
  const cost = run.cost_usd === null || run.cost_usd === undefined ? 'n/d' : `$${Number(run.cost_usd).toFixed(4)}`
  return `tokens ${n(run.tokens_in)}/${n(run.tokens_out)} · custo ${cost} (${run.measured ? 'medido' : 'n/d'})`
}

export async function runCmd(args) {
  const root = process.cwd()
  const { positionals, flags } = parseArgs(args)

  const stopId = flagString(flags, 'stop')
  if (stopId) {
    const db = openDb(root)
    try {
      const res = stopRun(db, stopId)
      if (!res.ok) throw new Error(res.reason)
      line(`⏹️  ${stopId} interrompido${res.killed ? '' : ' (processo já não existia)'}.`)
    } finally {
      db.close()
    }
    return
  }

  const arg = positionals[0]
  const toolName = flagString(flags, 'tool')
  if (!arg || !toolName) throw new Error(USAGE)
  const driver = driverFor(toolName)
  if (!driver) {
    throw new Error(`tool sem driver de execução: ${toolName} (disponíveis: ${Object.keys(DRIVERS).join(', ')})`)
  }

  let taskId
  try {
    taskId = resolveTaskName(activeDir(root), arg)
  } catch {
    throw new Error(`task não está ativa: ${arg}\n  rode antes: harness start ${arg} && harness worktree start ${arg}`)
  }
  const wt = taskWorktree(root, taskId)
  if (!wt) {
    throw new Error(`task sem worktree: ${taskId}\n  o agente só roda isolado — rode antes: harness worktree start ${arg}`)
  }

  const model = flagString(flags, 'model')
  const permissionMode = flagString(flags, 'permission-mode', 'acceptEdits')
  const unsafe = flagBool(flags, 'unsafe')
  if (flags['permission-mode'] !== undefined && driver.id !== 'claude') {
    throw new Error(`--permission-mode só vale para --tool claude (${driver.id} usa o sandbox próprio; liberar tudo exige --unsafe)`)
  }
  if (driver.requiresUnsafe && !unsafe) {
    throw new Error(`--tool ${driver.id} exige --unsafe: ${driver.requiresUnsafe}`)
  }
  for (const [name, value] of [['--model', model], ['--permission-mode', permissionMode]]) {
    if (value !== null && !SAFE_VALUE.test(value)) throw new Error(`${name} inválido: ${value}`)
  }
  const opts = { model, permissionMode, unsafe }
  driver.command(opts) // valida as opções antes de abrir run

  const prompt = buildPrompt(taskId, fs.readFileSync(path.join(activeDir(root), taskId), 'utf8'), wt)

  const db = openDb(root)
  const controller = new AbortController()
  const onSigint = () => {
    line('\n⏹️  interrompendo (Ctrl+C)…')
    controller.abort()
  }
  process.on('SIGINT', onSigint)
  let announced = false
  try {
    reapOrphans(db)
    if (unsafe) line(`⚠️  --unsafe: ${driver.id} roda sem pedir permissões (registrado no run).`)
    const result = await runTool({
      db,
      taskId,
      cwd: wt.dir,
      driver,
      prompt,
      opts,
      unsafe,
      signal: controller.signal,
      onEvent: (ev) => {
        if (!announced) {
          announced = true
          line(`▶️  ${ev.runId} · ${driver.id} · ${taskId} @ ${wt.path}`)
        }
        printEvent(ev)
      }
    })
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(result.runId)
    if (result.status === 'completed') {
      line(`✅ ${result.runId} concluído · ${fmtUsage(run)}`)
      line(`   timeline: harness events ${result.runId} · revise a worktree e integre com: harness worktree finish ${arg}`)
    } else {
      line(`❌ ${result.runId} falhou: ${oneLine(result.error, 300)}`)
      line(`   timeline: harness events ${result.runId}`)
      process.exitCode = 1
    }
  } finally {
    process.off('SIGINT', onSigint)
    db.close()
  }
}
