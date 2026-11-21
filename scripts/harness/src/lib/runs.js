import { redact } from './redact.js'

/**
 * Registro de execuções de agentes (feature `execucao-agentes`, task 93).
 *
 * Um **run** é uma execução de uma tool (claude/codex/opencode) para uma task;
 * os **run_events** são a timeline normalizada da execução, com o evento original
 * do runtime preservado em `native`. Ao contrário de `tasks`, nada aqui é índice
 * do markdown: `harness sync` não toca estas tabelas.
 *
 * Regra de honestidade: uso de tokens/custo só entra quando o runtime reporta
 * (`measured = 1`). Ausente → colunas `null` e `measured = 0`; nunca estimado aqui.
 */

export const RUN_STATUSES = ['running', 'completed', 'failed']

export const RUN_EVENT_TYPES = [
  'run.started',
  'run.completed',
  'run.failed',
  'agent.message',
  'agent.tool_call',
  'agent.tool_result',
  'agent.file_changed',
  'agent.usage',
  'agent.error'
]

const now = () => new Date().toISOString()

/** Redige segredos em todas as strings de um valor JSON (preserva a estrutura). */
export function redactDeep(value) {
  if (typeof value === 'string') return redact(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v)
    return out
  }
  return value
}

const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(redactDeep(value)))

function parseJson(text) {
  if (text === null || text === undefined) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)
}

export function newRunId(taskId, date = new Date()) {
  const num = String(taskId ?? '').match(/^(\d+)-/)?.[1] ?? 'x'
  return `run-${num}-${stamp(date)}`
}

/** Abre um run `running`. Retorna o id. */
export function startRun(db, { taskId, tool, toolVersion = null, model = null, sessionId = null, pid = null, cwd = null, unsafe = false, id = null }) {
  if (!taskId) throw new Error('startRun: taskId obrigatório')
  if (!tool) throw new Error('startRun: tool obrigatória')
  let runId = id ?? newRunId(taskId)
  // Dois runs no mesmo milissegundo (testes, retries rápidos): sufixo incremental.
  for (let n = 2; db.prepare('SELECT 1 FROM runs WHERE id = ?').get(runId); n++) {
    runId = `${id ?? newRunId(taskId)}-${n}`
  }
  db.prepare(
    `INSERT INTO runs (id, task_id, tool, tool_version, model, session_id, status, pid, cwd, started_at, measured, unsafe)
     VALUES (?,?,?,?,?,?, 'running', ?,?,?, 0, ?)`
  ).run(runId, taskId, tool, toolVersion, model, sessionId, pid, cwd, now(), unsafe ? 1 : 0)
  return runId
}

/** Atualiza campos descobertos durante a execução (pid, sessão, modelo, versão). */
export function updateRun(db, runId, fields = {}) {
  const allowed = { pid: 'pid', sessionId: 'session_id', model: 'model', toolVersion: 'tool_version', cwd: 'cwd' }
  const sets = []
  const values = []
  for (const [key, col] of Object.entries(allowed)) {
    if (fields[key] === undefined) continue
    sets.push(`${col} = ?`)
    values.push(fields[key])
  }
  if (sets.length === 0) return
  db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`).run(...values, runId)
}

/** Anexa um evento normalizado à timeline do run (seq monotônico por run). */
export function appendRunEvent(db, runId, { type, payload = null, native = null, at = null }) {
  if (!RUN_EVENT_TYPES.includes(type)) {
    throw new Error(`tipo de evento de run inválido: ${type} (use: ${RUN_EVENT_TYPES.join(' | ')})`)
  }
  const run = db.prepare('SELECT id FROM runs WHERE id = ?').get(runId)
  if (!run) throw new Error(`run não encontrado: ${runId}`)
  const { next } = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM run_events WHERE run_id = ?').get(runId)
  db.prepare(
    'INSERT INTO run_events (run_id, seq, at, type, payload_json, native_json) VALUES (?,?,?,?,?,?)'
  ).run(runId, next, at ?? now(), type, toJson(payload), toJson(native))
  return next
}

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Fecha o run. `usage` = `{ tokensIn, tokensOut, costUsd }` **reportado pelo
 * runtime**; qualquer campo numérico presente marca o run como medido.
 */
export function finishRun(db, runId, { status, exitCode = null, usage = null, error = null }) {
  if (!['completed', 'failed'].includes(status)) {
    throw new Error(`finishRun: status inválido ${status} (use completed | failed)`)
  }
  const tokensIn = numOrNull(usage?.tokensIn)
  const tokensOut = numOrNull(usage?.tokensOut)
  const costUsd = numOrNull(usage?.costUsd)
  const measured = [tokensIn, tokensOut, costUsd].some((v) => v !== null) ? 1 : 0
  const res = db.prepare(
    `UPDATE runs SET status = ?, exit_code = ?, finished_at = ?, tokens_in = ?, tokens_out = ?,
       cost_usd = ?, measured = ?, error = ? WHERE id = ?`
  ).run(status, exitCode, now(), tokensIn, tokensOut, costUsd, measured, error ? redact(String(error)) : null, runId)
  if (res.changes === 0) throw new Error(`run não encontrado: ${runId}`)
}

export function getRun(db, runId) {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) ?? null
}

export function listRuns(db, { taskId = null, limit = 50 } = {}) {
  if (taskId) {
    return db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC, id DESC LIMIT ?').all(taskId, limit)
  }
  return db.prepare('SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT ?').all(limit)
}

export function runEvents(db, runId) {
  return db
    .prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY seq')
    .all(runId)
    .map((e) => ({ id: e.id, run_id: e.run_id, seq: e.seq, at: e.at, type: e.type, payload: parseJson(e.payload_json), native: parseJson(e.native_json) }))
}

/** Último run da task (qualquer status) — usado pelo canvas. */
export function latestRun(db, taskId) {
  return db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at DESC, id DESC LIMIT 1').get(taskId) ?? null
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: o processo existe mas pertence a outro usuário.
    return err.code === 'EPERM'
  }
}

/**
 * Run `running` cujo processo não existe mais (harness morto, máquina reiniciada)
 * vira `failed`/`orphaned`. Run sem pid registrado também é órfão: o runner grava o
 * pid logo após o spawn, então `running` sem pid significa que o spawn nunca terminou.
 */
export function reapOrphans(db, { isAlive = pidAlive } = {}) {
  const running = db.prepare("SELECT id, pid FROM runs WHERE status = 'running'").all()
  const reaped = []
  for (const r of running) {
    if (r.pid !== null && isAlive(r.pid)) continue
    finishRun(db, r.id, { status: 'failed', error: 'orphaned' })
    appendRunEvent(db, r.id, { type: 'run.failed', payload: { reason: 'orphaned', pid: r.pid } })
    reaped.push(r.id)
  }
  return reaped
}

/** Duração em ms (até agora, se ainda rodando). */
export function runDurationMs(run, nowMs = Date.now()) {
  const start = Date.parse(run.started_at)
  if (!Number.isFinite(start)) return null
  const end = run.finished_at ? Date.parse(run.finished_at) : nowMs
  return Number.isFinite(end) ? end - start : null
}
