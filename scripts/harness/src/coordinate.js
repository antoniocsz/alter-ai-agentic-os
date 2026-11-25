// `harness coordinate` — coordenador de tarefas (feature coordenador-de-tarefas, task 137).
//   harness coordinate plan <feature> --tool <t[:modelo]> [--max-tasks 8] [--ignore-budget]
//   harness coordinate show <plano> [--json] | list [<feature>] | edit <plano> --file plano.json
//   harness coordinate approve <plano> [--only T1,T2] | reject <plano> | status <plano>
//   harness coordinate next <plano> --tool <t[:modelo]> [--review <t[:modelo]>] [--max-parallel n]
//                      [--unsafe] [--ignore-budget] [--no-context] [--dry-run]
import fs from 'node:fs'
import path from 'node:path'
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { startTask } from './lib/pipeline.js'
import { startWorktree } from './lib/worktree.js'
import { runTool } from './lib/runner.js'
import { createFlow, parseAgentSpec, runFlow } from './lib/flows.js'
import {
  PlanError,
  approvePlan,
  editPlan,
  generatePlan,
  getPlan,
  listPlans,
  planProgress,
  rejectPlan
} from './lib/coordinator.js'
import { budgetFor, budgetGate, prepareRun, printRunEvent, resolveRunOptions, taskWorktree, withSigint } from './run.js'

const USAGE = `uso: harness coordinate plan <feature> --tool <t[:modelo]> [--max-tasks n] [--ignore-budget]
     harness coordinate show <plano> [--json] | list [<feature>] | edit <plano> --file <plano.json>
     harness coordinate approve <plano> [--only T1,T2] | reject <plano> | status <plano>
     harness coordinate next <plano> --tool <t[:modelo]> [--review <t[:modelo]>] [--max-parallel n] [--unsafe] [--ignore-budget] [--no-context] [--dry-run]`

const PLAN_RE = /^plan-[a-z0-9-]+-\d{8,}$/
const STATE_ICON = { done: '✅', active: '▶️', queue: '⏳', 'not-created': '·', missing: '❓' }

function line(text = '') {
  process.stdout.write(text + '\n')
}

function planArg(raw) {
  if (!PLAN_RE.test(String(raw ?? ''))) throw new PlanError(`id de plano inválido: ${raw ?? '(vazio)'} (veja harness coordinate list)`)
  return raw
}

function flagsFor(agent, flags) {
  const f = { tool: agent.tool }
  if (agent.model) f.model = agent.model
  for (const k of ['unsafe', 'ignore-budget', 'no-context']) if (flagBool(flags, k)) f[k] = true
  return f
}

function printPlan(p) {
  line(`🧭 ${p.id} · feature ${p.feature} · ${p.status}${p.tool ? ` · coordenador ${p.tool}` : ''}${p.run_id ? ` · ${p.run_id}` : ''}`)
  const waves = p.plan.waves ?? []
  waves.forEach((wave, i) => {
    line(`\n   onda ${i + 1}${i === 0 ? ' (podem rodar em paralelo)' : ''}`)
    for (const id of wave) {
      const t = p.plan.tasks.find((x) => x.id === id)
      const made = p.tasks?.[id]
      line(`   ${id.padEnd(4)} ${t.title}${made ? `  → ${made.name}` : ''}`)
      line(`        ${t.agent} · ${t.type} · ${t.priority} · ${t.complexity}${t.acs.length ? ` · ${t.acs.join(', ')}` : ''}${t.depends_on.length ? ` · depende de ${t.depends_on.join(', ')}` : ''}`)
      line(`        escopo: ${t.scope.join(', ')}`)
    }
  })
  if (p.plan.notes) line(`\n   notas do coordenador: ${p.plan.notes}`)
  for (const w of p.warnings ?? []) line(`   ⚠️  ${w}`)
  if (p.status === 'proposed') {
    line(`\n   aprovar: harness coordinate approve ${p.id} [--only T1,T2] · ajustar: harness coordinate show ${p.id} --json > plano.json; edite; harness coordinate edit ${p.id} --file plano.json`)
  }
}

export async function coordinateCmd(args = []) {
  try {
    return await dispatch(process.cwd(), args)
  } catch (err) {
    if (err instanceof PlanError) throw new Error(err.message)
    throw err
  }
}

async function dispatch(root, args) {
  const [sub, ...rest] = args
  const { positionals, flags } = parseArgs(rest)
  if (!sub) throw new Error(USAGE)
  const db = openDb(root)
  try {
    if (sub === 'list') {
      const rows = listPlans(db, { feature: positionals[0] ?? null })
      if (flagBool(flags, 'json')) return line(JSON.stringify(rows, null, 2))
      if (!rows.length) return line('nenhum plano. gere com: harness coordinate plan <feature> --tool claude')
      for (const p of rows) line(`🧭 ${p.id} · ${p.feature} · ${p.status} · ${p.plan.tasks.length} task(s)`)
      return
    }
    if (sub === 'show') {
      const p = getPlan(db, planArg(positionals[0]))
      if (!p) throw new PlanError(`plano não encontrado: ${positionals[0]}`)
      return flagBool(flags, 'json') ? line(JSON.stringify(p, null, 2)) : printPlan(p)
    }
    if (sub === 'edit') {
      const file = flagString(flags, 'file')
      if (!file) throw new PlanError('uso: harness coordinate edit <plano> --file <plano.json>')
      let input
      try {
        input = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'))
      } catch (err) {
        throw new PlanError(`não consegui ler ${file}: ${err.message}`)
      }
      const p = editPlan(root, db, planArg(positionals[0]), input)
      line('✅ plano atualizado')
      return printPlan(p)
    }
    if (sub === 'reject') {
      rejectPlan(db, planArg(positionals[0]))
      return line('🗑️  plano rejeitado (nenhuma task criada).')
    }
    if (sub === 'approve') {
      const only = flagString(flags, 'only') ? flagString(flags, 'only').split(',').map((s) => s.trim()).filter(Boolean) : null
      const p = approvePlan(root, db, planArg(positionals[0]), { only })
      line(`✅ ${p.id} aprovado — tasks criadas em tasks/queue/:`)
      for (const [id, t] of Object.entries(p.tasks)) line(`   ${id.padEnd(4)} → ${t.name}`)
      line(`\n   executar a 1ª onda: harness coordinate next ${p.id} --tool claude [--review codex]`)
      return
    }
    if (sub === 'status') {
      const prog = planProgress(root, db, planArg(positionals[0]))
      if (flagBool(flags, 'json')) return line(JSON.stringify(prog, null, 2))
      line(`🧭 ${prog.plan.id} · ${prog.plan.feature} · ${prog.plan.status}${prog.done ? ' · ✅ todas concluídas' : ''}`)
      for (const it of prog.items) {
        const extra = [it.run ? `run ${it.run.status}${it.run.quality ? ` · gates ${it.run.quality}` : ''}` : null, it.flow ? `fluxo ${it.flow.status}` : null, it.ready ? 'pronta' : null].filter(Boolean)
        line(`   ${STATE_ICON[it.state] ?? '·'} ${it.id.padEnd(4)} ${it.task ?? it.title} · ${it.state}${extra.length ? ` · ${extra.join(' · ')}` : ''}`)
      }
      return
    }
    if (sub === 'plan') return await planCmd(root, db, positionals, flags)
    if (sub === 'next') return await nextCmd(root, db, positionals, flags)
    throw new Error(USAGE)
  } finally {
    db.close()
  }
}

async function planCmd(root, db, positionals, flags) {
  const feature = positionals[0]
  if (!feature || !flags.tool) throw new Error(USAGE)
  const agent = parseAgentSpec(flags.tool, 'tool')
  const { probe: driver, opts, unsafe } = resolveRunOptions(flagsFor(agent, flags), agent.tool)
  if (!unsafe) {
    opts.readOnly = true
    if (driver.id === 'claude') opts.permissionMode = 'plan'
  }
  const maxRaw = flagString(flags, 'max-tasks', '8')
  const maxTasks = Number(maxRaw)
  if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 12) throw new PlanError(`--max-tasks inválido: ${maxRaw} (1–12)`)
  const money = budgetFor(root, flags)
  const gate = budgetGate(db, money.budget, money.ignore, `feature:${feature}`)
  if (gate.skip) throw new PlanError(`orçamento estourado: ${gate.skip}`)
  const { signal, dispose } = withSigint()
  try {
    line(`🧭 pedindo ao coordenador (${driver.id}) a decomposição de ${feature}…`)
    const p = await generatePlan({ root, db, feature, driver, opts, unsafe, signal, maxTasks, limit: gate.limit ?? null, onEvent: (ev) => printRunEvent(ev) })
    line('')
    printPlan(p)
  } finally {
    dispose()
  }
}

/** Próxima onda: tasks do plano na queue com dependências concluídas → start + worktree + run/fluxo. */
async function nextCmd(root, db, positionals, flags) {
  const id = planArg(positionals[0])
  if (!flags.tool) throw new Error(USAGE)
  const impl = parseAgentSpec(flags.tool, 'tool')
  const review = flags.review !== undefined ? parseAgentSpec(flags.review, 'review') : null
  for (const a of [impl, ...(review ? [review] : [])]) resolveRunOptions(flagsFor(a, flags), a.tool)
  const maxRaw = flagString(flags, 'max-parallel')
  const max = maxRaw === null ? 3 : Number(maxRaw)
  if (!Number.isInteger(max) || max < 1) throw new PlanError(`--max-parallel inválido: ${maxRaw}`)

  const prog = planProgress(root, db, id)
  if (prog.plan.status !== 'approved') throw new PlanError(`plano ${id} está ${prog.plan.status} — aprove antes: harness coordinate approve ${id}`)
  if (prog.done) return line(`✅ ${id}: todas as tasks concluídas.`)
  const ready = prog.items.filter((i) => i.ready)
  if (!ready.length) {
    const active = prog.items.filter((i) => i.state === 'active')
    return line(
      active.length
        ? `⏳ nada pronto: ${active.map((i) => i.task).join(', ')} em andamento — integre com harness worktree finish <task> e rode next de novo.`
        : `⏳ nada pronto — veja: harness coordinate status ${id}`
    )
  }
  line(`🧭 próxima onda de ${id}: ${ready.map((i) => `${i.id} (${i.task})`).join(', ')}`)
  if (flagBool(flags, 'dry-run')) return line('   (dry-run: nada iniciado)')

  const jobs = []
  for (const it of ready) {
    const st = startTask(root, it.task)
    if (!st.ok) {
      line(`   ❌ ${it.task}: ${st.error}`)
      continue
    }
    try {
      if (!taskWorktree(root, it.task)) startWorktree(root, it.task)
    } catch (err) {
      line(`   ❌ ${it.task}: worktree — ${err.message}`)
      continue
    }
    jobs.push(it)
  }

  const { signal, dispose } = withSigint()
  const results = []
  try {
    let next = 0
    const worker = async () => {
      for (;;) {
        if (signal.aborted) return
        const it = jobs[next++]
        if (!it) return
        const tag = `[${it.id}]`
        try {
          if (review) {
            const flow = createFlow(db, {
              taskId: it.task,
              plan: { implement: impl, review, fix: null, unsafe: flagBool(flags, 'unsafe'), ignoreBudget: flagBool(flags, 'ignore-budget'), noContext: flagBool(flags, 'no-context') },
              rounds: 2,
              approve: 'none'
            })
            line(`   ${tag} 🔗 ${flow.id}`)
            const fdb = openDb(root)
            try {
              const res = await runFlow({
                db: fdb,
                flowId: flow.id,
                signal,
                prepare: (role, agent, extra) => prepareRun(root, flagsFor(agent, flags), it.task, fdb, { role, extra }),
                worktree: (t) => taskWorktree(root, t),
                onStep: (ev) => {
                  if (ev.status !== 'running') line(`   ${tag} ${ev.role} ${ev.status}${ev.verdict ? ` · ${ev.verdict}` : ''}${ev.error ? ` · ${ev.error}` : ''}`)
                }
              })
              results.push({ it, status: res.status, detail: res.error })
            } finally {
              fdb.close()
            }
          } else {
            const rdb = openDb(root)
            try {
              const prep = prepareRun(root, flagsFor(impl, flags), it.task, rdb)
              const res = await runTool({
                db: rdb, taskId: prep.taskId, cwd: prep.wt.dir, driver: prep.driver, prompt: prep.prompt, opts: prep.opts, unsafe: prep.unsafe,
                signal, limit: prep.gate.limit ?? null, budgetOverride: prep.money.ignore, gates: prep.gates,
                onEvent: (ev) => {
                  if (ev.type === 'run.started') line(`   ${tag} ▶ ${ev.runId}`)
                  if (ev.type === 'agent.file_changed') printRunEvent(ev, `   ${tag}`)
                }
              })
              results.push({ it, status: res.status, detail: res.error ?? (res.quality ? `gates ${res.quality}` : null) })
            } finally {
              rdb.close()
            }
          }
        } catch (err) {
          results.push({ it, status: 'failed', detail: err.message })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(max, jobs.length) }, worker))
  } finally {
    dispose()
  }
  line('')
  for (const r of results) line(`   ${r.status === 'completed' ? '✅' : '❌'} ${r.it.id} ${r.it.task}: ${r.status}${r.detail ? ` · ${r.detail}` : ''}`)
  line(`\n   revise cada worktree e integre: harness worktree finish <task> · depois: harness coordinate next ${id} --tool ${impl.tool}`)
  if (results.some((r) => r.status !== 'completed')) process.exitCode = 1
}
