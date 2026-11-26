/**
 * Visão do projeto para a tela Início do Workspace (feature `projetos-e-inicio`, task 143):
 * contagens do pipeline, fila (por prioridade), concluídas recentes com o handoff e uso dos
 * agentes nos últimos 7 dias. Só leitura.
 */
import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks } from './tasks.js'
import { analytics, parseSince } from './analytics.js'

function head(dir, name) {
  try {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8').replace(/^﻿/, '')
    const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? name).trim().replace(/^Task:\s*/i, '')
    const priority = raw.match(/^##\s*Prioridade:\s*(P[0-3])/mi)?.[1]?.toUpperCase() ?? raw.match(/Prioridade:\s*(P[0-3])/i)?.[1]?.toUpperCase() ?? 'P2'
    const feature = raw.match(/^##\s*Feature:\s*([a-z0-9][a-z0-9-]*)/mi)?.[1] ?? null
    return { id: name, title, priority, feature }
  } catch {
    return { id: name, title: name, priority: 'P2', feature: null }
  }
}

/** Concluídas mais recentes (pela data do evento `finished`) com o último handoff de cada uma. */
function recentDone(db, root, limit) {
  const files = listTasks(doneDir(root))
  if (!db) return files.slice(-limit).reverse().map((f) => ({ ...head(doneDir(root), f), at: null, handoff: null }))
  let rows = []
  try {
    rows = db
      .prepare("SELECT task_id, MAX(at) AS at FROM task_events WHERE event = 'finished' GROUP BY task_id ORDER BY at DESC LIMIT ?")
      .all(limit * 3)
  } catch {}
  const known = rows.filter((r) => files.includes(r.task_id)).slice(0, limit)
  const pick = known.length ? known : files.slice(-limit).reverse().map((f) => ({ task_id: f, at: null }))
  const handoffOf = (id) => {
    try {
      const row = db
        .prepare("SELECT content FROM interactions WHERE task_id = ? AND kind = 'note' AND content LIKE 'handoff:%' ORDER BY at DESC, id DESC LIMIT 1")
        .get(id)
      return row ? row.content.replace(/^handoff:\s*/, '') : null
    } catch {
      return null
    }
  }
  return pick.map((r) => ({ ...head(doneDir(root), r.task_id), at: r.at, handoff: handoffOf(r.task_id) }))
}

export function projectOverview(root, db, { now = new Date() } = {}) {
  const queue = listTasks(queueDir(root)).map((f) => head(queueDir(root), f))
  queue.sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }))
  const active = listTasks(activeDir(root)).map((f) => head(activeDir(root), f))
  const doneCount = listTasks(doneDir(root)).length
  let usage = null
  if (db) {
    try {
      const a = analytics(db, { since: parseSince('7d', now) })
      const t = a.totals
      usage = { runs: t.runs, completed: t.completed, failed: t.failed, success_rate: t.success_rate, cost_usd: t.cost_usd, tokens: (t.tokens_in ?? 0) + (t.tokens_out ?? 0), quality_passed: t.quality_passed, quality_failed: t.quality_failed }
    } catch {}
  }
  return {
    name: path.basename(path.resolve(root)),
    stats: { queue: queue.length, active: active.length, done: doneCount },
    active,
    queue: queue.slice(0, 12),
    recent: recentDone(db, root, 6),
    usage
  }
}
