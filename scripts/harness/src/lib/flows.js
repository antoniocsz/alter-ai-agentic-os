// Orquestração encadeada (feature orquestracao-encadeada, task 121): implementar → revisar →
// corrigir, cada etapa um run de agente na MESMA worktree da task, com tools diferentes por papel,
// limite de rodadas e aprovação humana entre etapas. O estado vive no banco (`flows`,
// `flow_steps`): o fluxo pausa (aprovação, falha, rodadas esgotadas) e é retomado depois.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { runTool } from './runner.js'
import { getRun } from './runs.js'

export const ROLES = ['implement', 'review', 'fix']
export const APPROVE_MODES = ['none', 'review', 'each']
export const FLOW_STATUSES = ['running', 'waiting_approval', 'needs_human', 'completed', 'failed', 'stopped']
/** Estados em que o fluxo ainda "ocupa" a task (não deixa abrir outro). */
export const OPEN_STATUSES = ['running', 'waiting_approval', 'needs_human', 'failed']
const DIFF_LIMIT = 60_000
const UNTRACKED_FILE_LIMIT = 8_000

export class FlowError extends Error {}

const nowIso = () => new Date().toISOString()

export function ensureFlowSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      rounds INTEGER NOT NULL,
      approve TEXT NOT NULL,
      human_note TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_flows_task ON flows(task_id);
    CREATE TABLE IF NOT EXISTS flow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id TEXT NOT NULL REFERENCES flows(id),
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      tool TEXT NOT NULL,
      model TEXT,
      run_id TEXT,
      status TEXT NOT NULL,
      verdict TEXT,
      notes TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_steps_seq ON flow_steps(flow_id, seq);
  `)
}

/** `claude` ou `claude:claude-sonnet-4-6` → { tool, model }. */
export function parseAgentSpec(raw, label) {
  if (!raw || raw === true) throw new FlowError(`--${label} exige a tool (ex.: --${label} claude ou --${label} codex:gpt-5)`)
  const [tool, ...rest] = String(raw).split(':')
  const model = rest.join(':') || null
  if (!/^[a-z0-9-]+$/.test(tool)) throw new FlowError(`--${label} inválido: ${raw}`)
  return { tool, model }
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)
}

export function newFlowId(taskId) {
  const num = String(taskId ?? '').match(/^(\d+)-/)?.[1] ?? 'x'
  return `flow-${num}-${stamp()}`
}

function flowOut(row) {
  if (!row) return null
  let plan = {}
  try {
    plan = JSON.parse(row.plan_json)
  } catch {}
  const { plan_json: _p, ...rest } = row
  return { ...rest, plan }
}

export function getFlow(db, id) {
  return flowOut(db.prepare('SELECT * FROM flows WHERE id = ?').get(id))
}

export function flowSteps(db, id) {
  return db.prepare('SELECT * FROM flow_steps WHERE flow_id = ? ORDER BY seq').all(id)
}

export function listFlows(db, { taskId = null, limit = 30 } = {}) {
  const rows = taskId
    ? db.prepare('SELECT * FROM flows WHERE task_id = ? ORDER BY created_at DESC LIMIT ?').all(taskId, limit)
    : db.prepare('SELECT * FROM flows ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map(flowOut)
}

/** Fluxo ainda aberto na task (bloqueia abrir outro até concluir/parar). */
export function openFlowFor(db, taskId) {
  const row = db
    .prepare(`SELECT * FROM flows WHERE task_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 1`)
    .get(taskId, ...OPEN_STATUSES)
  return flowOut(row)
}

/**
 * Cria o fluxo. `plan` = { implement: {tool, model}, review: {tool, model}, fix: {tool, model},
 * unsafe, ignoreBudget, noContext }. `rounds` = máximo de revisões; `approve` = quando pausar.
 */
export function createFlow(db, { taskId, plan, rounds = 2, approve = 'none' }) {
  if (!plan?.implement?.tool || !plan?.review?.tool) throw new FlowError('fluxo exige --implement e --review')
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new FlowError(`--rounds inválido: ${rounds} (1–10)`)
  if (!APPROVE_MODES.includes(approve)) throw new FlowError(`--approve inválido: ${approve} (use ${APPROVE_MODES.join(', ')})`)
  const open = openFlowFor(db, taskId)
  if (open) throw new FlowError(`a task já tem um fluxo aberto: ${open.id} (${open.status}) — retome com: harness flow resume ${open.id} · ou pare: harness flow stop ${open.id}`)
  const full = { ...plan, fix: plan.fix?.tool ? plan.fix : plan.implement }
  const id = newFlowId(taskId)
  const at = nowIso()
  db.prepare(
    'INSERT INTO flows (id, task_id, status, plan_json, rounds, approve, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, taskId, 'running', JSON.stringify(full), rounds, approve, at, at)
  return getFlow(db, id)
}

function setFlow(db, id, fields) {
  const keys = Object.keys(fields)
  db.prepare(`UPDATE flows SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    nowIso(),
    id
  )
}

/**
 * Próxima etapa a partir do histórico: nada → implement; após implement/fix concluídos → review;
 * revisão aprovada → fim; com mudanças → fix (se ainda há rodadas) ou humano.
 * Retorna `{ role }`, `{ done: true }` ou `{ needsHuman: motivo }`.
 */
export function nextStep(flow, steps) {
  const last = steps.at(-1)
  if (!last) return { role: 'implement' }
  if (last.status === 'failed') return { retry: last.role }
  if (last.role === 'implement' || last.role === 'fix') return { role: 'review' }
  if (last.verdict === 'approved') return { done: true }
  const reviews = steps.filter((s) => s.role === 'review' && s.status === 'completed').length
  if (reviews >= flow.rounds) return { needsHuman: `${reviews} revisão(ões) sem aprovação (limite --rounds ${flow.rounds})` }
  return { role: 'fix' }
}

// ---------- revisão ----------

const VERDICT_RE = /^\s*[*_`>]*\s*VEREDITO\s*[*_`]*\s*:\s*[*_`]*\s*(APROVADO|APPROVED|MUDAN[ÇC]AS|CHANGES(?:[ _]REQUESTED)?|REPROVADO)/im

/** Veredito do revisor a partir do texto final: `{ verdict: 'approved'|'changes', notes }` ou null. */
export function parseVerdict(text) {
  const src = String(text ?? '')
  const m = src.match(VERDICT_RE)
  if (!m) return null
  const word = m[1].toUpperCase()
  const verdict = word.startsWith('APRO') ? 'approved' : 'changes'
  const after = src.slice(m.index + m[0].length).replace(/^[*_`]+/, '').replace(/^[\s—–:-]+/, '').trim()
  const before = src.slice(0, m.index).trim()
  const notes = verdict === 'changes' ? after || before : after || null
  return { verdict, notes: notes ? notes.slice(0, 6000) : null }
}

function lastAgentTexts(db, runId) {
  return db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'agent.message' ORDER BY seq DESC")
    .all(runId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)?.text ?? ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

function gitOut(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/** Assinatura do estado da worktree (status + diff + conteúdo dos não rastreados). */
export function worktreeSignature(dir) {
  const status = gitOut(dir, ['status', '--porcelain', '--untracked-files=all'])
  const diff = gitOut(dir, ['diff', 'HEAD'])
  const untracked = gitOut(dir, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .map((f) => {
      try {
        return `${f}:${fs.statSync(path.join(dir, f)).size}:${fs.statSync(path.join(dir, f)).mtimeMs}`
      } catch {
        return f
      }
    })
    .join('\n')
  return `${status}\n${diff}\n${untracked}`
}

/** Diff da worktree contra a base (commits + não commitado + arquivos novos), para o revisor. */
export function worktreeDiff(dir, base) {
  const parts = []
  const tracked = gitOut(dir, ['diff', base ? base : 'HEAD'])
  if (tracked.trim()) parts.push(tracked)
  for (const f of gitOut(dir, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
    let text = ''
    try {
      text = fs.readFileSync(path.join(dir, f), 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) {
      parts.push(`--- arquivo novo (binário): ${f}`)
      continue
    }
    const body = text.length > UNTRACKED_FILE_LIMIT ? text.slice(0, UNTRACKED_FILE_LIMIT) + '\n… (cortado)' : text
    parts.push(`--- arquivo novo: ${f}\n${body}`)
  }
  let diff = parts.join('\n')
  let truncated = false
  if (diff.length > DIFF_LIMIT) {
    diff = diff.slice(0, DIFF_LIMIT)
    truncated = true
  }
  return { diff, truncated, empty: !diff.trim() }
}

// ---------- execução ----------

/** Gates pós-run (task 128) da última implementação/correção, para o revisor. */
export function gatesNote(db, runId) {
  if (!runId) return null
  const run = db.prepare('SELECT quality FROM runs WHERE id = ?').get(runId)
  if (!run?.quality) return null
  const rows = db
    .prepare("SELECT payload_json FROM run_events WHERE run_id = ? AND type = 'quality.gate' ORDER BY seq")
    .all(runId)
    .map((r) => {
      try {
        return JSON.parse(r.payload_json)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  const lines = rows.map((g) => `- ${g.gate}: ${g.status}${g.reason ? ` (${g.reason})` : ''}${g.status === 'failed' && g.output ? `\n  ${String(g.output).split('\n').slice(-8).join('\n  ')}` : ''}`)
  return `resultado: ${run.quality}\n${lines.join('\n')}`
}

function extraFor(role, { diff, reviewNotes, humanNote, gates }) {
  const blocks = []
  if (role === 'review' && gates) blocks.push('--- GATES PÓS-RUN DA ÚLTIMA ALTERAÇÃO (harness.json → gates.run) ---', gates)
  if (role === 'review') {
    blocks.push(
      `--- MUDANÇA A REVISAR (diff da worktree contra a base${diff.truncated ? '; CORTADO — leia os arquivos para o resto' : ''}) ---`,
      diff.empty ? '(nenhuma mudança na worktree — se a task exige mudança, reprove)' : diff.diff
    )
  }
  if (role === 'fix' && reviewNotes) blocks.push('--- REVISÃO A ATENDER ---', reviewNotes)
  if (humanNote) blocks.push('--- INSTRUÇÕES DO HUMANO (prioridade sobre a revisão) ---', humanNote)
  return blocks.length ? blocks.join('\n') : null
}

/**
 * Executa o fluxo até pausar ou terminar. `prepare(role, agent, extra)` monta o run (o `prepareRun`
 * do harness run, injetado para não acoplar) e retorna `{ taskId, wt, driver, opts, unsafe, gate,
 * money, prompt }`; `worktree(taskId)` devolve `{ dir, base }` (diff do revisor). Resolve com o
 * fluxo atualizado.
 */
export async function runFlow({ db, flowId, prepare, worktree, env = process.env, signal = null, onEvent = () => {}, onStep = () => {} }) {
  for (;;) {
    const flow = getFlow(db, flowId)
    if (!flow) throw new FlowError(`fluxo não encontrado: ${flowId}`)
    if (flow.status !== 'running') return flow
    if (signal?.aborted) {
      setFlow(db, flowId, { status: 'stopped', error: 'interrompido', finished_at: nowIso() })
      return getFlow(db, flowId)
    }
    const steps = flowSteps(db, flowId)
    const next = nextStep(flow, steps)
    if (next.done) {
      setFlow(db, flowId, { status: 'completed', error: null, finished_at: nowIso() })
      return getFlow(db, flowId)
    }
    if (next.needsHuman) {
      setFlow(db, flowId, { status: 'needs_human', error: next.needsHuman })
      return getFlow(db, flowId)
    }
    const role = next.role ?? next.retry
    const agent = flow.plan[role]
    const lastReview = [...steps].reverse().find((s) => s.role === 'review' && s.status === 'completed')
    const seq = (steps.at(-1)?.seq ?? 0) + 1

    let prep
    let before = null
    let diff = { diff: '', truncated: false, empty: true }
    try {
      if (role === 'review') {
        const wt = worktree(flow.task_id)
        if (!wt) throw new FlowError(`task sem worktree: ${flow.task_id}`)
        diff = worktreeDiff(wt.dir, wt.base)
      }
      const lastChange = [...steps].reverse().find((s) => (s.role === 'implement' || s.role === 'fix') && s.status === 'completed')
      const gates = role === 'review' ? gatesNote(db, lastChange?.run_id) : null
      prep = prepare(role, agent, extraFor(role, { diff, reviewNotes: lastReview?.notes, humanNote: flow.human_note, gates }))
    } catch (err) {
      db.prepare('INSERT INTO flow_steps (flow_id, seq, role, tool, model, status, error, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
        flowId, seq, role, agent.tool, agent.model, 'failed', err.message, nowIso(), nowIso()
      )
      setFlow(db, flowId, { status: 'failed', error: `${role}: ${err.message}` })
      onStep({ flowId, seq, role, status: 'failed', error: err.message })
      return getFlow(db, flowId)
    }

    const stepId = Number(
      db.prepare('INSERT INTO flow_steps (flow_id, seq, role, tool, model, status, started_at) VALUES (?,?,?,?,?,?,?)').run(
        flowId, seq, role, agent.tool, agent.model, 'running', nowIso()
      ).lastInsertRowid
    )
    if (flow.human_note) setFlow(db, flowId, { human_note: null }) // nota consumida por esta etapa
    onStep({ flowId, seq, role, status: 'running', tool: agent.tool })
    if (role === 'review') before = worktreeSignature(prep.wt.dir)

    let result
    try {
      result = await runTool({
        db,
        taskId: prep.taskId,
        cwd: prep.wt.dir,
        driver: prep.driver,
        prompt: prep.prompt,
        opts: prep.opts,
        unsafe: prep.unsafe,
        env,
        signal,
        limit: prep.gate.limit ?? null,
        budgetOverride: prep.money.ignore,
        gates: prep.gates ?? null,
        onStart: (runId) => db.prepare('UPDATE flow_steps SET run_id = ? WHERE id = ?').run(runId, stepId),
        onEvent
      })
    } catch (err) {
      result = { runId: null, status: 'failed', error: err.message }
    }

    let status = result.status === 'completed' ? 'completed' : 'failed'
    let error = status === 'failed' ? result.error ?? 'run falhou' : null
    let verdict = null
    let notes = null
    if (status === 'completed' && role === 'review') {
      if (worktreeSignature(prep.wt.dir) !== before) {
        status = 'failed'
        error = 'o revisor alterou a worktree (revisão só lê) — confira as mudanças antes de retomar'
      } else {
        const parsed = lastAgentTexts(db, result.runId).map(parseVerdict).find(Boolean)
        if (!parsed) {
          status = 'failed'
          error = 'revisor não deu veredito (VEREDITO: APROVADO | VEREDITO: MUDANÇAS)'
        } else {
          verdict = parsed.verdict
          notes = parsed.notes
        }
      }
    }
    db.prepare('UPDATE flow_steps SET run_id = ?, status = ?, verdict = ?, notes = ?, error = ?, finished_at = ? WHERE id = ?').run(
      result.runId ?? null, status, verdict, notes, error, nowIso(), stepId
    )
    onStep({ flowId, seq, role, status, verdict, notes, error, runId: result.runId })

    if (status === 'failed') {
      const interrupted = result.error === 'interrupted' || signal?.aborted
      setFlow(db, flowId, interrupted ? { status: 'stopped', error: 'interrompido', finished_at: nowIso() } : { status: 'failed', error: `${role}: ${error}` })
      return getFlow(db, flowId)
    }
    if (role === 'review' && verdict === 'approved') continue // nextStep fecha como completed
    const pause = flow.approve === 'each' || (flow.approve === 'review' && role === 'review')
    if (pause) {
      const done = nextStep(flow, flowSteps(db, flowId))
      if (!done.done && !done.needsHuman) {
        setFlow(db, flowId, { status: 'waiting_approval', error: null })
        return getFlow(db, flowId)
      }
    }
  }
}

/**
 * Retoma: aguardando aprovação → segue; falhou → repete a etapa que falhou; sem aprovação após as
 * rodadas → ganha mais uma rodada (correção + revisão). `note` vira instrução para a próxima etapa.
 */
export function resumeFlow(db, id, { note = null } = {}) {
  const flow = getFlow(db, id)
  if (!flow) throw new FlowError(`fluxo não encontrado: ${id}`)
  if (!['waiting_approval', 'failed', 'needs_human'].includes(flow.status)) {
    throw new FlowError(`fluxo ${id} está ${flow.status} — só retoma aguardando aprovação, com falha ou pedindo humano`)
  }
  const fields = { status: 'running', error: null }
  if (flow.status === 'needs_human') fields.rounds = flow.rounds + 1
  if (note && String(note).trim()) fields.human_note = String(note).trim().slice(0, 4000)
  setFlow(db, id, fields)
  return getFlow(db, id)
}

/** Para o fluxo; se uma etapa estiver rodando em outro processo, interrompe o run dela. */
export function stopFlow(db, id, { stopRun = null } = {}) {
  const flow = getFlow(db, id)
  if (!flow) throw new FlowError(`fluxo não encontrado: ${id}`)
  if (['completed', 'stopped'].includes(flow.status)) throw new FlowError(`fluxo ${id} já está ${flow.status}`)
  const running = flowSteps(db, id).find((s) => s.status === 'running' && s.run_id)
  let stopped = null
  if (running && stopRun) {
    const run = getRun(db, running.run_id)
    if (run?.status === 'running') stopped = stopRun(db, running.run_id)
  }
  setFlow(db, id, { status: 'stopped', error: 'parado pelo humano', finished_at: nowIso() })
  return { flow: getFlow(db, id), stoppedRun: stopped ? running.run_id : null }
}
