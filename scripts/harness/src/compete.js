// `harness compete` — execução competitiva (feature execucao-competitiva, task 124).
//   harness compete <task> --tools claude,codex[:modelo] [--judge <tool[:modelo]>] [--max-parallel n]
//                   [--unsafe] [--ignore-budget] [--no-context]
//   harness compete pick <comp> <candidata> | discard <comp> | show <comp> | list [<task>] [--json]
import path from 'node:path'
import { openDb, resolveTaskId } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { activeDir, resolveTaskName, parseTask } from './lib/tasks.js'
import { parseBaseline } from './lib/pipeline.js'
import { parseAgentSpec, openFlowFor } from './lib/flows.js'
import {
  CompetitionError,
  competitors,
  createCompetition,
  discardCompetition,
  getCompetition,
  listCompetitions,
  parseCompetitors,
  pickCompetitor,
  runCompetition
} from './lib/competitions.js'
import { prepareRun, resolveRunOptions, taskWorktree, withSigint } from './run.js'

const USAGE = `uso: harness compete <task> --tools <t1,t2[:modelo],...> [--judge <tool[:modelo]>] [--max-parallel n]
                     [--unsafe] [--ignore-budget] [--no-context]
     harness compete pick <comp> <candidata> | discard <comp> | show <comp> | list [<task>] [--json]`

const ICON = { running: '▶️', ready: '🏁', picked: '✅', discarded: '🗑️', failed: '❌' }
const COMP_ID_RE = /^comp-[A-Za-z0-9x]+-\d{8,}$/

function line(text = '') {
  process.stdout.write(text + '\n')
}

function compIdArg(raw) {
  if (!COMP_ID_RE.test(String(raw ?? ''))) throw new CompetitionError(`id de competição inválido: ${raw ?? '(vazio)'} (veja harness compete list)`)
  return raw
}

function flagsFor(plan, agent) {
  const flags = { tool: agent.tool }
  if (agent.model) flags.model = agent.model
  if (plan.unsafe) flags.unsafe = true
  if (plan.ignoreBudget) flags['ignore-budget'] = true
  if (plan.noContext) flags['no-context'] = true
  return flags
}

const fmtMoney = (v) => (v === null || v === undefined ? 'n/d' : `$${Number(v).toFixed(4)}`)

function table(db, comp) {
  const rows = competitors(db, comp.id)
  for (const c of rows) {
    const run = c.run_id ? db.prepare('SELECT * FROM runs WHERE id = ?').get(c.run_id) : null
    const dur = run?.finished_at && run?.started_at ? `${Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000)}s` : 'n/d'
    const size = c.files_changed === null ? 'n/d' : `${c.files_changed} arq · +${c.insertions}/-${c.deletions}`
    const tokens = run && (run.tokens_in !== null || run.tokens_out !== null) ? `${run.tokens_in ?? 'n/d'}/${run.tokens_out ?? 'n/d'}` : 'n/d'
    const flags = [
      run?.quality ? `gates ${run.quality}` : null,
      comp.judge_winner === c.key ? '⭐ juiz' : null,
      comp.winner === c.key ? '✅ escolhida' : null,
      c.out_of_scope.length ? `⚠️ fora do escopo: ${c.out_of_scope.join(', ')}` : null
    ].filter(Boolean)
    line(`   ${c.status === 'completed' ? '✔' : c.status === 'running' ? '▶' : '✖'} ${c.key.padEnd(10)} ${c.tool}${c.model ? `:${c.model}` : ''} · ${size} · tokens ${tokens} · ${fmtMoney(run?.cost_usd)} · ${dur}${flags.length ? ` · ${flags.join(' · ')}` : ''}`)
    if (c.error) line(`      erro: ${c.error}`)
    line(`      ${c.dir}`)
  }
  if (comp.judge_tool) {
    line(`   ⚖️  juiz (${comp.judge_tool}): ${comp.judge_winner ? `recomenda ${comp.judge_winner}` : 'sem recomendação'}`)
    if (comp.judge_notes) for (const l of comp.judge_notes.split('\n').slice(-8)) line(`      ${l}`)
  }
}

function showComp(db, id, json) {
  const comp = getCompetition(db, id)
  if (!comp) throw new CompetitionError(`competição não encontrada: ${id}`)
  if (json) return line(JSON.stringify({ competition: comp, competitors: competitors(db, id) }, null, 2))
  line(`${ICON[comp.status] ?? '·'} ${comp.id} · ${comp.task_id} · ${comp.status}${comp.error ? ` — ${comp.error}` : ''}`)
  table(db, comp)
  if (comp.status === 'ready') line(`\n   escolha: harness compete pick ${comp.id} <candidata> · descarte: harness compete discard ${comp.id}`)
}

export async function competeCmd(args = []) {
  try {
    return await dispatch(process.cwd(), args)
  } catch (err) {
    if (err instanceof CompetitionError) throw new Error(err.message)
    throw err
  }
}

function taskContext(root, arg) {
  let taskId
  try {
    taskId = resolveTaskName(activeDir(root), arg)
  } catch {
    throw new CompetitionError(`task não está ativa: ${arg}\n  rode antes: harness start ${arg} && harness worktree start ${arg}`)
  }
  const wt = taskWorktree(root, taskId)
  if (!wt) throw new CompetitionError(`task sem worktree: ${taskId}\n  rode antes: harness worktree start ${arg} (a vencedora é aplicada nela)`)
  return { taskId, wt }
}

async function dispatch(root, args) {
  const [sub, ...rest] = args
  if (!sub) throw new Error(USAGE)
  if (['list', 'show', 'pick', 'discard'].includes(sub)) {
    const { positionals, flags } = parseArgs(rest)
    const db = openDb(root)
    try {
      if (sub === 'list') {
        const rows = listCompetitions(db, { taskId: positionals[0] ? resolveTaskId(root, positionals[0]) : null })
        if (flagBool(flags, 'json')) return line(JSON.stringify(rows, null, 2))
        if (!rows.length) return line('nenhuma competição. crie com: harness compete <task> --tools claude,codex')
        for (const c of rows) line(`${ICON[c.status] ?? '·'} ${c.id} · ${c.task_id} · ${c.status}${c.winner ? ` · vencedora ${c.winner}` : ''}`)
        return
      }
      const id = compIdArg(positionals[0])
      if (sub === 'show') return showComp(db, id, flagBool(flags, 'json'))
      if (sub === 'discard') {
        discardCompetition(root, db, id)
        return line(`🗑️  ${id} descartada — worktrees e branches das candidatas removidas.`)
      }
      const key = positionals[1]
      if (!key) throw new CompetitionError(`uso: harness compete pick ${id} <candidata>`)
      const comp = getCompetition(db, id)
      if (!comp) throw new CompetitionError(`competição não encontrada: ${id}`)
      const wt = taskWorktree(root, comp.task_id)
      if (!wt) throw new CompetitionError(`a worktree da task ${comp.task_id} não existe mais`)
      const res = pickCompetitor(root, db, id, key, wt)
      line(`✅ ${key} (${res.winner.tool}) aplicada em ${wt.path} (mudanças no índice, sem commit); demais candidatas removidas.`)
      line(`   revise e integre: harness worktree finish ${comp.task_id}`)
      return
    } finally {
      db.close()
    }
  }

  const { positionals, flags } = parseArgs(args)
  const { taskId, wt } = taskContext(root, positionals[0])
  const candidates = parseCompetitors(flags.tools)
  const plan = { unsafe: flagBool(flags, 'unsafe'), ignoreBudget: flagBool(flags, 'ignore-budget'), noContext: flagBool(flags, 'no-context') }
  const judge = flags.judge !== undefined ? parseAgentSpec(flags.judge, 'judge') : null
  for (const agent of [...candidates, ...(judge ? [judge] : [])]) {
    try {
      resolveRunOptions(flagsFor(plan, agent), agent.tool)
    } catch (err) {
      throw new CompetitionError(`${agent.key ?? 'juiz'} (${agent.tool}): ${err.message}`)
    }
  }
  const maxRaw = flagString(flags, 'max-parallel')
  const max = maxRaw === null ? candidates.length : Number(maxRaw)
  if (!Number.isInteger(max) || max < 1) throw new CompetitionError(`--max-parallel inválido: ${maxRaw}`)

  const task = parseTask(path.join(activeDir(root), taskId))
  const db = openDb(root)
  const { signal, dispose } = withSigint()
  try {
    const flow = openFlowFor(db, taskId)
    if (flow) throw new CompetitionError(`a task tem um fluxo aberto (${flow.id}) — conclua ou pare antes: harness flow stop ${flow.id}`)
    const comp = createCompetition(root, db, { taskId, taskWt: wt, candidates, plan, judge })
    line(`🏁 ${comp.id} · ${taskId} · ${candidates.map((c) => c.key).join(' vs ')}${judge ? ` · juiz ${judge.tool}` : ''}`)
    if (plan.unsafe) line('⚠️  --unsafe: todas as candidatas rodam sem pedir permissões.')
    const result = await runCompetition({
      root,
      db,
      id: comp.id,
      taskWt: wt,
      scope: task.scope,
      baseline: parseBaseline(task),
      max,
      signal,
      prepare: (agent, candidateWt, role, extra) => prepareRun(root, flagsFor(plan, agent), taskId, db, { role, extra, wt: candidateWt }),
      onCandidate: (ev) => {
        if (ev.status === 'running') line(`   ▶ ${ev.key} (${ev.tool}) rodando…`)
        else line(`   ${ev.status === 'completed' ? '✔' : '✖'} ${ev.key} ${ev.status}${ev.error ? `: ${ev.error}` : ''}${ev.stats?.files !== null && ev.stats?.files !== undefined ? ` · ${ev.stats.files} arquivo(s)` : ''}`)
      }
    })
    line('')
    showComp(db, result.id, false)
    if (result.status !== 'ready') process.exitCode = 1
  } finally {
    dispose()
    db.close()
  }
}
