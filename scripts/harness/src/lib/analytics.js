// Analytics de execuções (feature qualidade-e-analytics, task 129): tokens, custo, sucesso,
// duração e qualidade (gates pós-run) agregados por task, agente, tool, modelo ou dia.
// Só o que as tools REPORTARAM entra nas somas de tokens/custo; runs sem uso medido são contados
// à parte (`unmeasured`) — o total é um piso, nunca uma estimativa.

export const GROUPS = ['tool', 'model', 'task', 'agent', 'day']

/** `30d`, `12h`, `2026-11-01` → ISO de início; null = desde sempre. */
export function parseSince(raw, now = new Date()) {
  if (raw === null || raw === undefined || raw === '' || raw === 'all') return null
  const rel = String(raw).match(/^(\d+)\s*([dh])$/i)
  if (rel) {
    const ms = Number(rel[1]) * (rel[2].toLowerCase() === 'h' ? 3_600_000 : 86_400_000)
    if (ms <= 0) throw new Error(`--since inválido: ${raw}`)
    return new Date(now.getTime() - ms).toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw)) && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString()
  throw new Error(`--since inválido: ${raw} (ex.: 7d, 24h, 2026-11-01, all)`)
}

const KEY_SQL = {
  tool: 'r.tool',
  model: "COALESCE(r.model, 'n/d')",
  task: 'r.task_id',
  agent: "COALESCE(NULLIF(TRIM(REPLACE(t.agent, '`', '')), ''), 'n/d')",
  day: 'substr(r.started_at, 1, 10)'
}

const round = (v, n = 4) => (v === null || v === undefined ? null : Number(Number(v).toFixed(n)))

function shape(row) {
  const finished = row.completed + row.failed
  return {
    key: row.key,
    runs: row.runs,
    running: row.running,
    completed: row.completed,
    failed: row.failed,
    success_rate: finished ? round(row.completed / finished, 3) : null,
    tokens_in: row.tokens_in ?? 0,
    tokens_out: row.tokens_out ?? 0,
    cost_usd: round(row.cost_usd ?? 0),
    measured: row.measured,
    unmeasured: row.runs - row.measured,
    avg_duration_ms: row.avg_duration_ms === null ? null : Math.round(row.avg_duration_ms),
    quality_passed: row.quality_passed,
    quality_failed: row.quality_failed,
    quality_rate: row.quality_passed + row.quality_failed ? round(row.quality_passed / (row.quality_passed + row.quality_failed), 3) : null
  }
}

/**
 * Agregação. `by` ∈ GROUPS; `since`/`until` = ISO (filtra por início do run).
 * Retorna `{ by, since, until, totals, groups[] }` — grupos por custo, depois por tokens.
 */
export function analytics(db, { by = 'tool', since = null, until = null } = {}) {
  if (!GROUPS.includes(by)) throw new Error(`--by inválido: ${by} (use ${GROUPS.join(', ')})`)
  const where = []
  const params = []
  if (since) {
    where.push('r.started_at >= ?')
    params.push(since)
  }
  if (until) {
    where.push('r.started_at < ?')
    params.push(until)
  }
  const select = (key) => `
    SELECT ${key} AS key,
      COUNT(*) AS runs,
      SUM(r.status = 'running') AS running,
      SUM(r.status = 'completed') AS completed,
      SUM(r.status = 'failed') AS failed,
      SUM(CASE WHEN r.measured = 1 THEN COALESCE(r.tokens_in, 0) ELSE 0 END) AS tokens_in,
      SUM(CASE WHEN r.measured = 1 THEN COALESCE(r.tokens_out, 0) ELSE 0 END) AS tokens_out,
      SUM(CASE WHEN r.measured = 1 THEN COALESCE(r.cost_usd, 0) ELSE 0 END) AS cost_usd,
      SUM(r.measured = 1) AS measured,
      AVG(CASE WHEN r.finished_at IS NOT NULL THEN (julianday(r.finished_at) - julianday(r.started_at)) * 86400000 END) AS avg_duration_ms,
      SUM(r.quality = 'passed') AS quality_passed,
      SUM(r.quality = 'failed') AS quality_failed
    FROM runs r LEFT JOIN tasks t ON t.id = r.task_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`
  const groups = db
    .prepare(`${select(KEY_SQL[by])} GROUP BY 1`)
    .all(...params)
    .map(shape)
    .sort((a, b) => (by === 'day' ? String(b.key).localeCompare(String(a.key)) : b.cost_usd - a.cost_usd || b.tokens_in + b.tokens_out - (a.tokens_in + a.tokens_out) || b.runs - a.runs))
  const totalRow = db.prepare(select("'total'")).get(...params)
  const totals = totalRow && totalRow.runs ? shape(totalRow) : shape({ key: 'total', runs: 0, running: 0, completed: 0, failed: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, measured: 0, avg_duration_ms: null, quality_passed: 0, quality_failed: 0 })
  return { by, since, until, generated_at: new Date().toISOString(), totals, groups }
}
