// `harness flow` — orquestração encadeada (feature orquestracao-encadeada, task 121).
//   harness flow <task> --implement <tool[:modelo]> --review <tool[:modelo]> [--fix <tool[:modelo]>]
//                [--rounds 2] [--approve none|review|each] [--unsafe] [--ignore-budget] [--no-context]
//   harness flow resume <flow> [--note "instruções"] | stop <flow> | show <flow> | list [<task>]
import { openDb } from './lib/db.js'
import { parseArgs, flagBool, flagString } from './lib/flags.js'
import { activeDir, resolveTaskName } from './lib/tasks.js'
import { stopRun } from './lib/runner.js'
import { resolveTaskId } from './lib/db.js'
import {
  FlowError,
  createFlow,
  flowSteps,
  getFlow,
  listFlows,
  parseAgentSpec,
  resumeFlow,
  runFlow,
  stopFlow
} from './lib/flows.js'
import { prepareRun, resolveRunOptions, taskWorktree, printRunEvent, withSigint } from './run.js'

const USAGE = `uso: harness flow <task> --implement <tool[:modelo]> --review <tool[:modelo]> [--fix <tool[:modelo]>]
                  [--rounds n] [--approve none|review|each] [--unsafe] [--ignore-budget] [--no-context]
     harness flow resume <flow> [--note "instruções para a próxima etapa"]
     harness flow stop <flow> | show <flow> | list [<task>] [--json]`

const ROLE_LABEL = { implement: 'implementar', review: 'revisar', fix: 'corrigir' }
const STATUS_ICON = { running: '▶️', waiting_approval: '⏸️', needs_human: '🙋', completed: '✅', failed: '❌', stopped: '⏹️' }

function line(text = '') {
  process.stdout.write(text + '\n')
}

const FLOW_ID_RE = /^flow-[A-Za-z0-9x]+-\d{8,}$/

function flowIdArg(raw) {
  if (!FLOW_ID_RE.test(String(raw ?? ''))) throw new FlowError(`id de fluxo inválido: ${raw ?? '(vazio)'} (veja harness flow list)`)
  return raw
}

/** Bandeiras de run de uma etapa, no formato do parseArgs (o mesmo caminho do harness run). */
export function stepFlags(plan, agent) {
  const flags = { tool: agent.tool }
  if (agent.model) flags.model = agent.model
  if (plan.unsafe) flags.unsafe = true
  if (plan.ignoreBudget) flags['ignore-budget'] = true
  if (plan.noContext) flags['no-context'] = true
  return flags
}

function printStep(ev) {
  const who = `${ROLE_LABEL[ev.role] ?? ev.role}`
  if (ev.status === 'running') return line(`\n━━ etapa ${ev.seq}: ${who} · ${ev.tool}`)
  if (ev.status === 'failed') return line(`   ❌ etapa ${ev.seq} (${who}) falhou: ${ev.error}`)
  if (ev.role === 'review') {
    line(ev.verdict === 'approved' ? '   ✅ revisão: APROVADO' : '   🔁 revisão: MUDANÇAS')
    if (ev.notes && ev.verdict !== 'approved') for (const l of String(ev.notes).split('\n').slice(0, 12)) line(`      ${l}`)
    return
  }
  line(`   ✔ etapa ${ev.seq} (${who}) concluída · run ${ev.runId}`)
}

function printOutcome(flow) {
  const icon = STATUS_ICON[flow.status] ?? '·'
  line('')
  switch (flow.status) {
    case 'completed':
      return line(`${icon} ${flow.id}: revisão aprovada. Revise a worktree e integre: harness worktree finish ${flow.task_id}`)
    case 'waiting_approval':
      return line(`${icon} ${flow.id}: aguardando aprovação — veja: harness flow show ${flow.id}\n   seguir: harness flow resume ${flow.id} [--note "instruções"] · parar: harness flow stop ${flow.id}`)
    case 'needs_human':
      return line(`${icon} ${flow.id}: ${flow.error}\n   mais uma rodada: harness flow resume ${flow.id} [--note "..."] · ou corrija à mão e pare: harness flow stop ${flow.id}`)
    case 'failed':
      process.exitCode = 1
      return line(`${icon} ${flow.id} falhou: ${flow.error}\n   repetir a etapa: harness flow resume ${flow.id} · parar: harness flow stop ${flow.id}`)
    case 'stopped':
      process.exitCode = 1
      return line(`${icon} ${flow.id} parado (${flow.error ?? '—'}).`)
    default:
      return line(`${icon} ${flow.id}: ${flow.status}`)
  }
}

/** Executa (ou continua) o fluxo em primeiro plano. */
async function drive(root, db, flowId) {
  const flow = getFlow(db, flowId)
  const { signal, dispose } = withSigint()
  try {
    const result = await runFlow({
      db,
      flowId,
      signal,
      prepare: (role, agent, extra) => prepareRun(root, stepFlags(flow.plan, agent), flow.task_id, db, { role, extra }),
      worktree: (taskId) => taskWorktree(root, taskId),
      onStep: printStep,
      onEvent: (ev) => printRunEvent(ev, '   ')
    })
    printOutcome(result)
    return result
  } finally {
    dispose()
  }
}

function showFlow(db, id, json) {
  const flow = getFlow(db, id)
  if (!flow) throw new FlowError(`fluxo não encontrado: ${id}`)
  const steps = flowSteps(db, id)
  if (json) return line(JSON.stringify({ flow, steps }, null, 2))
  const p = flow.plan
  const spec = (a) => `${a.tool}${a.model ? `:${a.model}` : ''}`
  line(`${STATUS_ICON[flow.status] ?? '·'} ${flow.id} · ${flow.task_id} · ${flow.status}${flow.error ? ` — ${flow.error}` : ''}`)
  line(`   implementar ${spec(p.implement)} → revisar ${spec(p.review)} → corrigir ${spec(p.fix)} · até ${flow.rounds} revisão(ões) · aprovação: ${flow.approve}`)
  if (flow.human_note) line(`   nota do humano (próxima etapa): ${flow.human_note}`)
  for (const s of steps) {
    const verdict = s.verdict ? ` · ${s.verdict === 'approved' ? 'APROVADO' : 'MUDANÇAS'}` : ''
    line(`   ${s.seq}. ${ROLE_LABEL[s.role] ?? s.role} · ${s.tool}${s.model ? `:${s.model}` : ''} · ${s.status}${verdict}${s.run_id ? ` · ${s.run_id}` : ''}${s.error ? ` — ${s.error}` : ''}`)
    if (s.notes && s.verdict === 'changes') for (const l of s.notes.split('\n').slice(0, 20)) line(`        ${l}`)
  }
}

export async function flowCmd(args = []) {
  const root = process.cwd()
  const [sub, ...rest] = args
  try {
    return await dispatch(root, sub, rest, args)
  } catch (err) {
    if (err instanceof FlowError) throw new Error(err.message)
    throw err
  }
}

async function dispatch(root, sub, rest, args) {
  if (!sub) throw new Error(USAGE)
  if (sub === 'list') {
    const { positionals, flags } = parseArgs(rest)
    const db = openDb(root)
    try {
      const taskId = positionals[0] ? resolveTaskId(root, positionals[0]) : null
      const rows = listFlows(db, { taskId })
      if (flagBool(flags, 'json')) return line(JSON.stringify(rows, null, 2))
      if (!rows.length) return line('nenhum fluxo. crie com: harness flow <task> --implement claude --review codex')
      for (const f of rows) line(`${STATUS_ICON[f.status] ?? '·'} ${f.id} · ${f.task_id} · ${f.status}${f.error ? ` — ${f.error}` : ''}`)
      return
    } finally {
      db.close()
    }
  }
  if (sub === 'show') {
    const { positionals, flags } = parseArgs(rest)
    const db = openDb(root)
    try {
      return showFlow(db, flowIdArg(positionals[0]), flagBool(flags, 'json'))
    } finally {
      db.close()
    }
  }
  if (sub === 'stop') {
    const { positionals } = parseArgs(rest)
    const db = openDb(root)
    try {
      const res = stopFlow(db, flowIdArg(positionals[0]), { stopRun })
      return line(`⏹️  ${res.flow.id} parado${res.stoppedRun ? ` (run ${res.stoppedRun} interrompido)` : ''}.`)
    } finally {
      db.close()
    }
  }
  if (sub === 'resume') {
    const { positionals, flags } = parseArgs(rest)
    const db = openDb(root)
    try {
      const id = flowIdArg(positionals[0])
      if (flags.note === true) throw new FlowError('--note exige o texto')
      resumeFlow(db, id, { note: flagString(flags, 'note') })
      line(`▶️  retomando ${id}`)
      await drive(root, db, id)
      return
    } finally {
      db.close()
    }
  }

  // harness flow <task> ...
  const { positionals, flags } = parseArgs(args)
  const arg = positionals[0]
  if (!arg) throw new Error(USAGE)
  let taskId
  try {
    taskId = resolveTaskName(activeDir(root), arg)
  } catch {
    throw new FlowError(`task não está ativa: ${arg}\n  rode antes: harness start ${arg} && harness worktree start ${arg}`)
  }
  if (!taskWorktree(root, taskId)) throw new FlowError(`task sem worktree: ${taskId}\n  rode antes: harness worktree start ${arg}`)
  const plan = {
    implement: parseAgentSpec(flags.implement, 'implement'),
    review: parseAgentSpec(flags.review, 'review'),
    fix: flags.fix !== undefined ? parseAgentSpec(flags.fix, 'fix') : null,
    unsafe: flagBool(flags, 'unsafe'),
    ignoreBudget: flagBool(flags, 'ignore-budget'),
    noContext: flagBool(flags, 'no-context')
  }
  const roundsRaw = flagString(flags, 'rounds')
  const rounds = roundsRaw === null ? 2 : Number(roundsRaw)
  const approve = flagString(flags, 'approve', 'none')
  // Valida tool/opções de cada papel antes de abrir o fluxo (ex.: opencode sem --unsafe).
  for (const role of ['implement', 'review', 'fix']) {
    const agent = plan[role] ?? plan.implement
    try {
      resolveRunOptions(stepFlags(plan, agent), agent.tool)
    } catch (err) {
      throw new FlowError(`${ROLE_LABEL[role]} (${agent.tool}): ${err.message}`)
    }
  }
  const db = openDb(root)
  try {
    const flow = createFlow(db, { taskId, plan, rounds, approve })
    const fix = flow.plan.fix
    line(`🔗 ${flow.id} · ${taskId}`)
    line(`   implementar ${plan.implement.tool} → revisar ${plan.review.tool} → corrigir ${fix.tool} · até ${rounds} revisão(ões) · aprovação: ${approve}`)
    if (plan.unsafe) line('⚠️  --unsafe: todas as etapas rodam sem pedir permissões (o revisor deixa de ser só leitura na tool; a guarda do harness continua).')
    await drive(root, db, flow.id)
  } finally {
    db.close()
  }
}
