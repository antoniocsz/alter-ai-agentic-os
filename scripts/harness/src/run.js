import fs from 'node:fs'
import path from 'node:path'
import { openDb, logEvent } from './lib/db.js'
import { buildContextPackage, renderContextMarkdown } from './lib/context.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { activeDir, resolveTaskName } from './lib/tasks.js'
import { readRegistry } from './lib/worktree.js'
import { runTool, stopRun, resolveExecutable } from './lib/runner.js'
import { reapOrphans, newBatchId } from './lib/runs.js'
import { planBatch, prepareBatch, runBatch, formatPlanErrors } from './lib/batch.js'
import { resolveConfig } from './lib/config.js'
import { readBudget, checkBudget, effectiveRunLimit, formatViolation } from './lib/budget.js'
import * as claude from './lib/runtimes/claude.js'
import * as codex from './lib/runtimes/codex.js'
import * as opencode from './lib/runtimes/opencode.js'
import * as gemini from './lib/runtimes/gemini.js'

/** Drivers disponíveis para `--tool`. Drivers com `create()` guardam estado por run. */
export const DRIVERS = { claude, codex, opencode, gemini }

export function driverFor(toolName) {
  const mod = DRIVERS[toolName]
  if (!mod) return null
  return typeof mod.create === 'function' ? mod.create() : mod
}

const SAFE_VALUE = /^[A-Za-z0-9._:/@-]+$/

const USAGE = `uso: harness run <task> --tool <${Object.keys(DRIVERS).join('|')}> [--model <m>] [--permission-mode <modo>] [--unsafe] [--no-context | --context-budget <n>] [--ignore-budget] [--raw <arquivo>]
     harness run --batch <t1,t2,...> --tool <tool> [--max-parallel <n>] [--model <m>] [--unsafe]
     harness run --stop <run>`

/** Worktree registrada da task (exigida: o agente nunca roda na árvore principal). */
export function taskWorktree(root, taskId) {
  const entry = readRegistry(root).worktrees.find((w) => w.task === taskId)
  if (!entry) return null
  const dir = path.resolve(root, entry.path)
  return fs.existsSync(dir) ? { ...entry, dir } : null
}

export function buildPrompt(taskId, taskBody, wt, contextMd = null) {
  const parts = [
    `Você está executando a task ${taskId} do harness (AlterAI - Agentic OS)`,
    `na worktree ${wt.path} (branch ${wt.branch}). Regras desta execução:`,
    '- Leia AGENTS.md e siga o protocolo e os guard rails do projeto.',
    '- Toque SOMENTE os arquivos listados em "## Escopo" da task.',
    '- NÃO rode `harness finish`, `harness worktree finish`, merge, push nem comandos git que reescrevem histórico ou descartam mudanças — a integração é feita fora desta execução.',
    '- Ao terminar, responda com um resumo curto: o que foi feito, pendências e decisões.',
    '',
    '--- TASK ---',
    taskBody
  ]
  if (contextMd) {
    parts.push('', '--- CONTEXTO DO PROJETO (gerado pelo harness para esta task; consulte antes de investigar) ---', contextMd)
  }
  return parts.join('\n')
}

/**
 * Pacote de contexto para o prompt (task 104): orçamento de `--context-budget`, senão
 * `harness.json → context.budget` (padrão 8000); `--no-context` ou orçamento 0 desligam.
 * A seção `task` fica de fora (a task já vai inteira no prompt). Registra o tamanho no histórico.
 */
/**
 * Orçamento (task 107). Retorna `{ budget, ignore }`; `budget` null = sem limites configurados.
 */
export function budgetFor(root, flags) {
  return { budget: readBudget(resolveConfig(root)), ignore: flagBool(flags, 'ignore-budget') }
}

const fmtLimit = (l) =>
  [l?.tokens !== null && l?.tokens !== undefined && `${l.tokens} tokens`, l?.usd !== null && l?.usd !== undefined && `$${Number(l.usd).toFixed(2)}`]
    .filter(Boolean)
    .join(' · ')

/** Checagem de UMA task: { skip } se estourou, senão { limit } efetivo do run (ou {}). */
export function budgetGate(db, budget, ignore, taskId) {
  if (!budget || ignore) return {}
  const c = checkBudget(db, budget, { taskId })
  if (!c.ok) return { skip: `budget: ${c.violations.map(formatViolation).join('; ')}`, violations: c.violations }
  return { limit: effectiveRunLimit(budget, c.remaining) }
}

export function contextBudget(root, flags) {
  if (flagBool(flags, 'no-context')) return null
  if (flags['context-budget'] === true) throw new Error('--context-budget exige um número (ex.: --context-budget 6000; 0 desliga)')
  const raw = flagString(flags, 'context-budget')
  const budget = raw === null ? Number(resolveConfig(root).context?.budget ?? 8000) : Number(raw)
  if (!Number.isInteger(budget) || budget < 0) throw new Error(`--context-budget inválido: ${raw} (use inteiro >= 0)`)
  return budget === 0 ? null : budget
}

export function contextForRun(root, taskId, budget, db = null) {
  if (budget === null) return null
  const pkg = buildContextPackage(root, taskId, { budget, exclude: ['task'] })
  if (!pkg.sections.length) return null
  const summary = `${pkg.sections.length} seção(ões) · ~${pkg.total_tokens} tokens (estimado)` +
    (pkg.omitted.length ? ` · omitidas: ${pkg.omitted.map((o) => o.id).join(', ')}` : '')
  if (db) {
    try {
      logEvent(db, taskId, 'context_built', summary)
    } catch {}
  }
  return { md: renderContextMarkdown(pkg), pkg, summary }
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
    if (flags.raw !== undefined) throw new Error('--raw vale só para o run único (não no lote)')
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

  const budget = contextBudget(root, flags)
  const money = budgetFor(root, flags)
  if (flags.raw === true) throw new Error('--raw exige o caminho do arquivo (ex.: --raw .tmp/claude-raw.jsonl)')
  const rawLog = flagString(flags, 'raw') ? path.resolve(root, flagString(flags, 'raw')) : null

  const db = openDb(root)
  const { signal, dispose } = withSigint()
  let announced = false
  try {
    reapOrphans(db)
    const gate = budgetGate(db, money.budget, money.ignore, taskId)
    if (gate.skip) {
      throw new Error(
        `orçamento estourado para ${taskId}:\n` +
          gate.violations.map((v) => `  - ${formatViolation(v)}`).join('\n') +
          '\n  veja: harness budget · para rodar mesmo assim: --ignore-budget (fica registrado no run)'
      )
    }
    if (money.ignore && money.budget) line('⚠️  --ignore-budget: limites do harness.json ignorados (registrado no run).')
    if (gate.limit) line(`💰 limite deste run: ${fmtLimit(gate.limit)} (harness budget)`)
    if (rawLog) line(`🧾 saída bruta → ${path.relative(root, rawLog) || rawLog} (+ .stderr) — sem redaction: pode conter segredos`)
    const ctx = contextForRun(root, taskId, budget, db)
    if (ctx) line(`📦 contexto: ${ctx.summary} · ver: harness context ${arg}`)
    const prompt = buildPrompt(taskId, fs.readFileSync(path.join(activeDir(root), taskId), 'utf8'), wt, ctx?.md)
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
      limit: gate.limit ?? null,
      budgetOverride: money.ignore,
      rawLog,
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
  const budget = contextBudget(root, flags) // valida antes de preparar qualquer task
  const money = budgetFor(root, flags)
  if (money.budget && !money.ignore) {
    // Dia/mês estourados valem para o lote inteiro: recusa antes de preparar qualquer task.
    const pre = openDb(root)
    try {
      const c = checkBudget(pre, money.budget, {})
      if (!c.ok) {
        throw new Error(
          'lote recusado por orçamento — nada foi preparado nem executado:\n' +
            c.violations.map((v) => `  - ${formatViolation(v)}`).join('\n') +
            '\n  veja: harness budget · para rodar mesmo assim: --ignore-budget'
        )
      }
    } finally {
      pre.close()
    }
  }

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

  const batchId = newBatchId()
  const db = openDb(root)
  const { signal, dispose } = withSigint()
  try {
    reapOrphans(db)
    const jobs = plan.items.map((it) => {
      const wt = taskWorktree(root, it.name)
      if (!wt) throw new Error(`worktree não encontrada para ${it.name} após a preparação`)
      const ctx = contextForRun(root, it.name, budget, db)
      if (ctx) line(`   ${taskTag(it.name)} 📦 contexto: ${ctx.summary}`)
      return {
        taskId: it.name,
        cwd: wt.dir,
        driver: driverFor(toolName), // instância por run (drivers com estado)
        prompt: buildPrompt(it.name, fs.readFileSync(path.join(activeDir(root), it.name), 'utf8'), wt, ctx?.md),
        opts,
        unsafe,
        budgetOverride: money.ignore
      }
    })
    line(`🧩 ${batchId} · ${probe.id} · ${jobs.length} task(s) · até ${max} em paralelo`)
    if (unsafe) line(`⚠️  --unsafe: ${probe.id} roda sem pedir permissões (registrado em cada run).`)
    const announced = new Set()
    if (money.ignore && money.budget) line('⚠️  --ignore-budget: limites do harness.json ignorados (registrado em cada run).')
    const results = await runBatch({
      db,
      jobs,
      max,
      batchId,
      signal,
      beforeJob: (job) => {
        const gate = budgetGate(db, money.budget, money.ignore, job.taskId)
        if (gate.skip) line(`${taskTag(job.taskId)} ⏭️  pulada — ${gate.skip}`)
        else if (gate.limit) line(`${taskTag(job.taskId)} 💰 limite: ${fmtLimit(gate.limit)}`)
        return gate
      },
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
