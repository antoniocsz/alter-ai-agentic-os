import { openDb } from './db.js'

export function computeMetrics(root, { module, days } = {}) {
  const db = openDb(root)
  const where = module ? 'WHERE module LIKE ?' : ''
  const params = module ? [`%${module}%`] : []

  const counts = {}
  for (const status of ['queue', 'active', 'done']) {
    const r = db
      .prepare(`SELECT COUNT(*) AS n FROM tasks WHERE status = ?${where}`)
      .get(status, ...params)
    counts[status] = Number(r.n)
  }

  const cycleRows = db
    .prepare(
      `SELECT started_at, finished_at FROM tasks
       WHERE status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL${where}`
    )
    .all(...params)

  const cycles = []
  const cutoff = days ? new Date(Date.now() - days * 86400000).toISOString() : null
  let throughput = 0
  for (const r of cycleRows) {
    const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
    if (ms >= 0) cycles.push(ms / 3600000)
    if (cutoff && r.finished_at >= cutoff) throughput++
  }
  cycles.sort((a, b) => a - b)
  const avg = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0
  const median = cycles.length ? cycles[Math.floor(cycles.length / 2)] : 0

  const agingRows = db
    .prepare(
      `SELECT id, started_at FROM tasks WHERE status = 'active' AND started_at IS NOT NULL${where}`
    )
    .all(...params)
  const aging = agingRows
    .map((r) => ({
      id: r.id,
      days: Math.floor((Date.now() - new Date(r.started_at).getTime()) / 86400000)
    }))
    .sort((a, b) => b.days - a.days)

  const byModule = db
    .prepare(`SELECT module, COUNT(*) AS n FROM tasks WHERE module IS NOT NULL GROUP BY module ORDER BY n DESC`)
    .all()

  const byAgent = db
    .prepare(`SELECT agent, COUNT(*) AS n FROM tasks WHERE agent IS NOT NULL GROUP BY agent ORDER BY n DESC`)
    .all()

  return {
    counts,
    wip: counts.active,
    cycleHours: { count: cycles.length, avg: round(avg, 1), median: round(median, 1) },
    aging,
    throughput: cutoff ? { days, count: throughput } : null,
    byModule,
    byAgent
  }
}

function round(n, d) {
  return Number(n.toFixed(d))
}

export function formatTable(metrics) {
  const c = metrics.counts
  const lines = [
    `tasks: ${c.queue} queue / ${c.active} active / ${c.done} done   (WIP: ${metrics.wip})`,
    `cycle time (h): média ${metrics.cycleHours.avg} · mediana ${metrics.cycleHours.median} (${metrics.cycleHours.count} concluídas)`,
    metrics.throughput ? `throughput: ${metrics.throughput.count} concluída(s) nos últimos ${metrics.throughput.days} dia(s)` : '',
    '',
    'aging (dias em active):'
  ]
  if (metrics.aging.length === 0) lines.push('  (nenhuma task ativa)')
  for (const a of metrics.aging) lines.push(`  ${a.days}d  ${a.id}`)
  lines.push('', 'por módulo:')
  for (const m of metrics.byModule) lines.push(`  ${m.module} → ${m.n}`)
  lines.push('', 'por agente:')
  for (const a of metrics.byAgent) lines.push(`  ${a.agent} → ${a.n}`)
  return lines.filter(Boolean).join('\n')
}

export function toCsv(metrics) {
  const rows = [
    ['status', 'count'],
    ['queue', metrics.counts.queue],
    ['active', metrics.counts.active],
    ['done', metrics.counts.done],
    [],
    ['metric', 'value'],
    ['wip', metrics.wip],
    ['cycle_avg_h', metrics.cycleHours.avg],
    ['cycle_median_h', metrics.cycleHours.median]
  ]
  for (const a of metrics.aging) rows.push(['aging_days', `${a.id}=${a.days}`])
  for (const m of metrics.byModule) rows.push(['module', `${m.module}=${m.n}`])
  for (const ag of metrics.byAgent) rows.push(['agent', `${ag.agent}=${ag.n}`])
  return rows.filter((r) => r.length).map((r) => r.map(esc).join(',')).join('\n')
}

function esc(v) {
  return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
}