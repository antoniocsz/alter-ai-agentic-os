import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks, parseTask } from './tasks.js'
import { tryOpenDb } from './db.js'
import { listWorktrees } from './worktree.js'
import { redact } from './redact.js'
import { workspaceContext } from './workspace.js'
import { localDate } from './dates.js'

const norm = (p) => p.replace(/\\/g, '/')

function slug(value, max = 40) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

function today() {
  return localDate()
}

export function sessionEnd(root, summary, opts = {}) {
  const text = redact(String(summary ?? '').trim())
  if (!text) throw new Error('uso: harness session end "<resumo do que foi feito>"')

  const date = opts.date ?? today()
  const base = `${date}-${slug(text) || 'sessao'}`
  const dir = path.join(root, 'context', 'sessions')
  fs.mkdirSync(dir, { recursive: true })

  let id = base
  let counter = 2
  while (fs.existsSync(path.join(dir, `${id}.md`))) {
    id = `${base}-${counter++}`
  }

  const db = tryOpenDb(root)
  const project = path.basename(root)
  const createdAt = new Date().toISOString()

  if (db) {
    try {
      db.prepare(
        'INSERT INTO sessions (id, project, date, summary, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, project, date, text, createdAt)
    } catch {}
  }

  const file = path.join(dir, `${id}.md`)
  fs.writeFileSync(
    file,
    `# Sessão ${date}\n\nProjeto: ${project}\n\n${text}\n`
  )

  return { id, file: norm(path.relative(root, file)), date, summary: text }
}

export function pruneSessions(root, opts = {}) {
  const days = Number(opts.days ?? 90)
  const apply = Boolean(opts.apply)
  const dir = path.join(root, 'context', 'sessions')
  if (!fs.existsSync(dir)) return []

  const cutoff = Date.now() - days * 86_400_000
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ id: f.replace(/\.md$/, ''), file: f, path: path.join(dir, f) }))
    .filter((e) => {
      try {
        return fs.statSync(e.path).mtimeMs < cutoff
      } catch {
        return false
      }
    })

  if (!apply || entries.length === 0) return entries

  const month = new Date().toISOString().slice(0, 7)
  const archive = path.join(dir, 'archive', month)
  fs.mkdirSync(archive, { recursive: true })

  const db = tryOpenDb(root)
  for (const entry of entries) {
    fs.renameSync(entry.path, path.join(archive, entry.file))
    if (db) {
      try {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(entry.id)
      } catch {}
    }
  }
  return entries
}

export function listSessions(root, limit = 10) {  const db = tryOpenDb(root)
  if (db) {
    try {
      return db
        .prepare('SELECT id, date, summary, created_at FROM sessions ORDER BY created_at DESC LIMIT ?')
        .all(limit)
    } catch {}
  }
  const dir = path.join(root, 'context', 'sessions')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => ({
      id: f.replace(/\.md$/, ''),
      date: f.slice(0, 10),
      summary: fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean).slice(2).join(' '),
      created_at: null
    }))
}

export function lastHandoff(root) {
  const db = tryOpenDb(root)
  if (!db) return null
  try {
    return (
      db
        .prepare(
          "SELECT task_id, content, at FROM interactions WHERE content LIKE 'handoff:%' ORDER BY at DESC LIMIT 1"
        )
        .get() ?? null
    )
  } catch {
    return null
  }
}

function walkMarkdown(dir, out) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMarkdown(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
}

function searchMarkdown(root, term, limit) {
  const files = []
  for (const rel of ['context', 'tasks']) walkMarkdown(path.join(root, rel), files)
  const readme = path.join(root, 'README.md')
  if (fs.existsSync(readme)) files.push(readme)

  const hits = []
  const needle = term.toLowerCase()
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    let perFile = 0
    for (let i = 0; i < lines.length && perFile < 3; i++) {
      if (!lines[i].toLowerCase().includes(needle)) continue
      hits.push({
        kind: 'doc',
        source: `${norm(path.relative(root, file))}:${i + 1}`,
        text: lines[i].trim().slice(0, 180)
      })
      perFile++
      if (hits.length >= limit) return hits
    }
  }
  return hits
}

function searchDb(root, term, limit) {
  const db = tryOpenDb(root)
  if (!db) return []
  const like = `%${term}%`
  const hits = []

  try {
    for (const row of db
      .prepare(
        'SELECT id, date, summary FROM sessions WHERE summary LIKE ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(like, limit)) {
      hits.push({ kind: 'session', source: `sessão ${row.date} (${row.id})`, text: row.summary.slice(0, 180) })
    }
  } catch {}

  try {
    for (const row of db
      .prepare(
        'SELECT task_id, kind, content, at FROM interactions WHERE content LIKE ? ORDER BY at DESC LIMIT ?'
      )
      .all(like, limit)) {
      hits.push({ kind: 'note', source: `${row.task_id ?? 'geral'} · ${row.at}`, text: row.content.slice(0, 180) })
    }
  } catch {}

  try {
    for (const row of db
      .prepare(
        'SELECT task_id, event, message, at FROM task_events WHERE message LIKE ? ORDER BY at DESC LIMIT ?'
      )
      .all(like, limit)) {
      hits.push({ kind: 'event', source: `${row.task_id} · ${row.event}`, text: `${row.message ?? ''}`.slice(0, 180) })
    }
  } catch {}

  try {
    for (const row of db
      .prepare('SELECT id, title, status FROM tasks WHERE title LIKE ? LIMIT ?')
      .all(like, limit)) {
      hits.push({ kind: 'task', source: `${row.id} (${row.status})`, text: row.title ?? '' })
    }
  } catch {}

  return hits
}

function recallOne(root, term, limit) {
  const dbHits = searchDb(root, term, limit)
  const mdHits = searchMarkdown(root, term, limit)
  return [...dbHits, ...mdHits]
    .slice(0, limit)
    .map((hit) => ({ ...hit, text: redact(hit.text) }))
}

export function recall(root, term, opts = {}) {
  const text = String(term ?? '').trim()
  if (!text) throw new Error('uso: harness recall "<termo>"')
  const limit = opts.limit ?? 20

  const ctx = workspaceContext(root)
  if (ctx && !ctx.insideProject) {
    const out = []
    for (const project of ctx.reg.projects ?? []) {
      const hits = recallOne(project.path, text, limit)
      for (const hit of hits) out.push({ ...hit, project: project.name })
    }
    return out.slice(0, limit)
  }

  return recallOne(root, text, limit)
}

export function statusReport(root) {
  const queue = listTasks(queueDir(root))
  const active = listTasks(activeDir(root))
  const done = listTasks(doneDir(root))

  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 }
  const ordered = queue
    .map((name) => parseTask(path.join(queueDir(root), name)))
    .sort((a, b) => {
      const ra = rank[String(a.values?.Prioridade ?? '').trim()] ?? 9
      const rb = rank[String(b.values?.Prioridade ?? '').trim()] ?? 9
      return ra - rb || a.name.localeCompare(b.name)
    })

  return {
    name: path.basename(root),
    counts: { queue: queue.length, active: active.length, done: done.length },
    activeTasks: active,
    next: ordered.slice(0, 3).map((t) => `${t.name}${t.values?.Prioridade ? ` (${t.values.Prioridade})` : ''}`),
    worktrees: listWorktrees(root),
    sessions: listSessions(root, 3),
    handoff: lastHandoff(root)
  }
}
