import { localDate, localMonth } from './dates.js'

/**
 * Orçamento de custos (feature `orcamento-de-custos`, task 106).
 *
 * `harness.json → budget` declara limites opcionais (tokens e/ou USD) por escopo:
 *   run (uma execução) · task (soma dos runs da task) · day / month (runs iniciados no dia/mês LOCAL).
 * Só uso MEDIDO (reportado pela tool, `runs.measured = 1`) conta; runs sem uso reportado são
 * contados à parte — o consumido é um piso, nunca uma estimativa.
 */

export const BUDGET_SCOPES = ['run', 'task', 'day', 'month']
export const BUDGET_METRICS = ['tokens', 'usd']

export function validateBudget(budget) {
  const errors = []
  if (budget === undefined) return errors
  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
    return ['budget deve ser um objeto (ex.: { "day": { "usd": 50 } })']
  }
  for (const [scope, limits] of Object.entries(budget)) {
    if (!BUDGET_SCOPES.includes(scope)) {
      errors.push(`budget.${scope}: escopo desconhecido (use ${BUDGET_SCOPES.join(' | ')})`)
      continue
    }
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
      errors.push(`budget.${scope} deve ser um objeto com tokens e/ou usd`)
      continue
    }
    for (const [metric, value] of Object.entries(limits)) {
      if (!BUDGET_METRICS.includes(metric)) {
        errors.push(`budget.${scope}.${metric}: métrica desconhecida (use tokens | usd)`)
      } else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        errors.push(`budget.${scope}.${metric} deve ser número > 0`)
      } else if (metric === 'tokens' && !Number.isInteger(value)) {
        errors.push(`budget.${scope}.tokens deve ser inteiro`)
      }
    }
  }
  return errors
}

/** Limites normalizados `{ run, task, day, month }` (cada um `{ tokens, usd }` ou null); null se nada configurado. */
export function readBudget(cfg) {
  const raw = cfg?.budget
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  let any = false
  for (const scope of BUDGET_SCOPES) {
    const l = raw[scope]
    const tokens = typeof l?.tokens === 'number' && l.tokens > 0 ? l.tokens : null
    const usd = typeof l?.usd === 'number' && l.usd > 0 ? l.usd : null
    out[scope] = tokens !== null || usd !== null ? { tokens, usd } : null
    if (out[scope]) any = true
  }
  return any ? out : null
}

const empty = () => ({ tokens: 0, usd: 0, runs: 0, unmeasured: 0 })

function addRun(acc, r) {
  acc.runs++
  if (!r.measured) {
    acc.unmeasured++
    return
  }
  acc.tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0)
  acc.usd += r.cost_usd ?? 0
}

/**
 * Consumo medido agregado: hoje, mês corrente (datas locais) e por task (todo o histórico).
 */
export function usageSummary(db, { now = new Date() } = {}) {
  const today = localDate(now)
  const month = localMonth(now)
  const summary = { today: { date: today, ...empty() }, month: { month, ...empty() }, tasks: {}, total: empty() }
  let rows = []
  try {
    rows = db.prepare('SELECT task_id, started_at, tokens_in, tokens_out, cost_usd, measured FROM runs').all()
  } catch {
    return summary // banco antigo sem a tabela runs
  }
  for (const r of rows) {
    const started = new Date(r.started_at)
    addRun(summary.total, r)
    if (!Number.isNaN(started.getTime())) {
      if (localDate(started) === today) addRun(summary.today, r)
      if (localMonth(started) === month) addRun(summary.month, r)
    }
    summary.tasks[r.task_id] ??= empty()
    addRun(summary.tasks[r.task_id], r)
  }
  for (const acc of [summary.today, summary.month, summary.total, ...Object.values(summary.tasks)]) {
    acc.usd = Math.round(acc.usd * 1e6) / 1e6
  }
  return summary
}

/**
 * Checa task/dia/mês antes de iniciar um run. Violação = consumo medido ≥ limite.
 * Retorna { ok, violations: [{ scope, metric, used, limit }], remaining: { tokens, usd }, summary }.
 * `remaining` = o menor saldo entre os escopos (null quando não há limite para a métrica).
 */
export function checkBudget(db, budget, { taskId = null, now = new Date(), summary = null } = {}) {
  const s = summary ?? usageSummary(db, { now })
  const violations = []
  const remaining = { tokens: null, usd: null }
  if (!budget) return { ok: true, violations, remaining, summary: s }
  const scopes = [
    ['task', taskId ? s.tasks[taskId] ?? empty() : null],
    ['day', s.today],
    ['month', s.month]
  ]
  for (const [scope, used] of scopes) {
    const limits = budget[scope]
    if (!limits || !used) continue
    for (const metric of BUDGET_METRICS) {
      const limit = limits[metric]
      if (limit === null || limit === undefined) continue
      const value = used[metric]
      if (value >= limit) violations.push({ scope, metric, used: value, limit })
      const left = Math.max(0, limit - value)
      remaining[metric] = remaining[metric] === null ? left : Math.min(remaining[metric], left)
    }
  }
  return { ok: violations.length === 0, violations, remaining, summary: s }
}

/** Limite efetivo de UM run: o menor entre `budget.run` e o saldo de task/dia/mês. Null se nenhum. */
export function effectiveRunLimit(budget, remaining = { tokens: null, usd: null }) {
  if (!budget) return null
  const pick = (a, b) => (a === null || a === undefined ? b ?? null : b === null || b === undefined ? a : Math.min(a, b))
  const tokens = pick(budget.run?.tokens ?? null, remaining.tokens)
  const usd = pick(budget.run?.usd ?? null, remaining.usd)
  return tokens === null && usd === null ? null : { tokens, usd }
}

const SCOPE_LABEL = { task: 'task', day: 'dia', month: 'mês', run: 'execução' }

export function formatViolation(v) {
  const fmt = (m, x) => (m === 'usd' ? `$${Number(x).toFixed(2)}` : `${x} tokens`)
  return `${SCOPE_LABEL[v.scope] ?? v.scope}: ${fmt(v.metric, v.used)} de ${fmt(v.metric, v.limit)}`
}
