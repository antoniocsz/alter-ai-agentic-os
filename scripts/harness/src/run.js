import fs from 'node:fs'
import path from 'node:path'
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { activeDir, resolveTaskName } from './lib/tasks.js'
import { readRegistry } from './lib/worktree.js'
import { runTool, stopRun, resolveExecutable } from './lib/runner.js'
import { reapOrphans, newBatchId } from './lib/runs.js'
import { planBatch, prepareBatch, runBatch, formatPlanErrors } from './lib/batch.js'
import { resolveConfig } from './lib/config.js'
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
     harness run --batch <t1,t2,...> --tool <tool> [--max-parallel <n>] [--model <m>] [--unsafe]
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

function printEvent(ev, prefix = '') {
  const p = ev.payload ?? {}
  switch (ev.type) {
    case 'run.started':
      line(`${prefix}   sessão ${p.session_id ?? 'n/d'}${p.model ? ` · ${p.model}` : ''}`)
      break
    case 'agent.message':
      if (p.text && !p.final) line(`${prefix}   💬 ${oneLine(p.text)}`)
      break
    case 'agent.tool_call':
      line(`${prefix}   🔧 ${p.name ?? 'tool'}${p.input ? ` ${oneLine(p.input.command ?? p.input.file_path ?? p.input.pattern ?? '', 90)}` : ''}`)
      break
    case 'agent.tool_result':
      if (p.is_error) line(`${prefix}   ⚠️  erro de ferramenta: ${oneLine(p.text, 90)}`)
      break
    case 'agent.file_changed':
      line(`${prefix}   📝 ${p.path}`)
      break
    case 'agent.error':
      line(`${prefix}   ❌ ${oneLine(p.reason)}`)
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

/** Valida tool e opções (comum ao run único e ao lote). Lança erro acionável. */
function resolveRunOptions(flags, toolName) {
  const probe = driverFor(toolName)
  if (!probe) {
    throw new Error(`tool sem driver de execução: ${toolName} (disponíveis: ${Object.keys(DRIVERS).join(', ')})`)
  }
  const model = flagString(flags, 'model')
  const permissionMode = flagString(flags, 'permission-mode', 'acceptEdits')
  const unsafe = flagBool(flags, 'unsafe')
  if (flags['permission-mode'] !== undefined && probe.id !== 'claude') {
    throw new Error(`--permission-mode só vale para --tool claude (${probe.id} usa o sandbox próprio; liberar tudo exige --unsafe)`)
  }
  if (probe.requiresUnsafe && !unsafe) {
    throw new Error(`--tool ${probe.id} exige --unsafe: ${probe.requiresUnsafe}`)
  }
  for (const [name, value] of [['--model', model], ['--permission-mode', permissionMode]]) {
    if (value !== null && !SAFE_VALUE.test(value)) throw new Error(`${name} inválido: ${value}`)
  }
  const opts = { model, permissionMode, unsafe }
  probe.command(opts) // valida as opções antes de abrir run
  return { probe, opts, unsafe }
}

function withSigint(onAbort) {
  const controller = new AbortController()
  const handler = () => {
    line('\n⏹️  interrompendo (Ctrl+C)…')
    controller.abort()
    onAbort?.()
  }
  process.on('SIGINT', handler)
  return { signal: controller.signal, dispose: () => process.off('SIGINT', handler) }
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

  const toolName = flagString(flags, 'tool')
  const batchArg = flagString(flags, 'batch')
  if (batchArg) {
    if (!toolName) throw new Error(USAGE)
    return runBatchCmd(root, flags, toolName, batchArg)
  }
  if (flags.batch === true) throw new Error('--batch exige a lista de tasks (ex.: --batch 12,13,14)')

  const arg = positionals[0]
  if (!arg || !toolName) throw new Error(USAGE)
  const { probe: driver, opts, unsafe } = resolveRunOptions(flags, toolName)

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

  const prompt = buildPrompt(taskId, fs.readFileSync(path.join(activeDir(root), taskId), 'utf8'), wt)

  const db = openDb(root)
  const { signal, dispose } = withSigint()
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
      signal,
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
    dispose()
    db.close()
  }
}

const taskTag = (taskId) => `[${String(taskId).match(/^(\d+)-/)?.[1] ?? taskId}]`

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return 'n/d'
  const sec = Math.round(ms / 1000)
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`
}

/** `harness run --batch 12,13,14 --tool <t> [--max-parallel n]` — lote paralelo (task 100). */
async function runBatchCmd(root, flags, toolName, batchArg) {
  const { probe, opts, unsafe } = resolveRunOptions(flags, toolName)

  const maxRaw = flagString(flags, 'max-parallel')
  const max = maxRaw === null ? Math.max(1, Number(resolveConfig(root).wip?.active) || 1) : Number(maxRaw)
  if (!Number.isInteger(max) || max < 1) throw new Error(`--max-parallel inválido: ${maxRaw} (use inteiro >= 1)`)

  // Tool ausente: falha antes de mexer em qualquer task.
  if (!resolveExecutable(probe.bin)) throw new Error(`${probe.bin} não encontrado no PATH.\n  ${probe.installHint}`)

  const ids = batchArg.split(',').map((s) => s.trim()).filter(Boolean)
  const plan = planBatch(root, ids)
  if (plan.errors.length) {
    throw new Error(`lote recusado — nada foi preparado nem executado:\n${formatPlanErrors(plan.errors)}`)
  }

  const prepared = prepareBatch(root, plan.items)
  for (const p of prepared) {
    const did = [p.started && 'start', p.worktreeCreated && 'worktree'].filter(Boolean).join(' + ')
    line(`   ${taskTag(p.name)} ${p.name}${did ? ` — ${did}` : ' — já pronta'}`)
  }

  const jobs = plan.items.map((it) => {
    const wt = taskWorktree(root, it.name)
    if (!wt) throw new Error(`worktree não encontrada para ${it.name} após a preparação`)
    return {
      taskId: it.name,
      cwd: wt.dir,
      driver: driverFor(toolName), // instância por run (drivers com estado)
      prompt: buildPrompt(it.name, fs.readFileSync(path.join(activeDir(root), it.name), 'utf8'), wt),
      opts,
      unsafe
    }
  })

  const batchId = newBatchId()
  const db = openDb(root)
  const { signal, dispose } = withSigint()
  try {
    reapOrphans(db)
    line(`🧩 ${batchId} · ${probe.id} · ${jobs.length} task(s) · até ${max} em paralelo`)
    if (unsafe) line(`⚠️  --unsafe: ${probe.id} roda sem pedir permissões (registrado em cada run).`)
    const announced = new Set()
    const results = await runBatch({
      db,
      jobs,
      max,
      batchId,
      signal,
      onEvent: (ev) => {
        const tag = taskTag(ev.taskId)
        if (!announced.has(ev.runId)) {
          announced.add(ev.runId)
          line(`${tag} ▶️  ${ev.runId}`)
        }
        printEvent(ev, tag)
      }
    })

    line(`\n🧩 ${batchId} — resumo`)
    let failed = 0
    for (const r of results) {
      const run = r.runId ? db.prepare('SELECT * FROM runs WHERE id = ?').get(r.runId) : null
      const dur = run?.finished_at ? Date.parse(run.finished_at) - Date.parse(run.started_at) : null
      const icon = r.status === 'completed' ? '✅' : r.status === 'skipped' ? '⏭️ ' : '❌'
      if (r.status !== 'completed') failed++
      const tail = r.status === 'completed' ? fmtUsage(run) : oneLine(r.error, 160)
      line(`${icon} ${taskTag(r.taskId)} ${r.taskId} · ${r.runId ?? '—'} · ${fmtDuration(dur)} · ${tail}`)
    }
    line(`   lote: harness runs --batch ${batchId} · integre cada task com: harness worktree finish <task>`)
    if (failed) process.exitCode = 1
  } finally {
    dispose()
    db.close()
  }
}
