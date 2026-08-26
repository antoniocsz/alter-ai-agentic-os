import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks, parseTask } from './tasks.js'

const [NODE_MAJOR, NODE_MINOR] = process.versions.node.split('.').map(Number)
if (NODE_MAJOR < 22 || (NODE_MAJOR === 22 && NODE_MINOR < 5)) {
  process.stderr.write(
    `erro: o harness requer Node >= 22.5 (usa node:sqlite). Atual: ${process.versions.node}\n` +
      'atualize o Node e tente de novo.\n'
  )
  process.exit(1)
}

const origEmit = process.emit
process.emit = function (name, data, ...args) {
  if (name === 'warning' && data && data.message && String(data.message).includes('SQLite')) {
    return false
  }
  return origEmit.call(this, name, data, ...args)
}

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

export const DB_DIR = '.harness'
export const DB_FILE = 'harness.db'

const SCHEMA_VERSION = '1'

export function openDb(root) {
  const dir = path.join(root, DB_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, DB_FILE))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

export function tryOpenDb(root) {
  try {
    return openDb(root)
  } catch {
    return null
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      agent TEXT,
      module TEXT,
      status TEXT NOT NULL CHECK (status IN ('queue','active','done')),
      scope_json TEXT DEFAULT '[]',
      depends_on TEXT,
      baseline_json TEXT DEFAULT '[]',
      criteria_json TEXT,
      complexity TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT DEFAULT '',
      at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('prompt','response','note','system')),
      content TEXT NOT NULL,
      source TEXT DEFAULT 'cli',
      at TEXT NOT NULL,
      meta_json TEXT
    );
  `)

  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()
  if (!row) {
    db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)`).run(SCHEMA_VERSION)
  }
}

export function upsertTask(db, t) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id)
  const createdAt = existing?.created_at ?? now
  const startedAt = t.status === 'active' && existing?.status !== 'active' ? now : (existing?.started_at ?? null)
  const finishedAt = t.status === 'done' && existing?.status !== 'done' ? now : (existing?.finished_at ?? null)

  db.prepare(`
    INSERT INTO tasks (
      id, title, agent, module, status, scope_json, depends_on, baseline_json, criteria_json,
      complexity, created_at, started_at, finished_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      agent=excluded.agent,
      module=excluded.module,
      status=excluded.status,
      scope_json=excluded.scope_json,
      depends_on=excluded.depends_on,
      baseline_json=excluded.baseline_json,
      criteria_json=excluded.criteria_json,
      complexity=excluded.complexity,
      created_at=excluded.created_at,
      started_at=excluded.started_at,
      finished_at=excluded.finished_at,
      updated_at=excluded.updated_at
  `).run(
    t.id,
    t.title ?? '',
    t.agent ?? null,
    t.module ?? null,
    t.status,
    t.scope_json ?? '[]',
    t.depends_on ?? null,
    t.baseline_json ?? '[]',
    t.criteria_json ?? null,
    t.complexity ?? null,
    createdAt,
    startedAt,
    finishedAt,
    now
  )
  return { createdAt, startedAt, finishedAt }
}

export function logEvent(db, taskId, event, message = '') {
  db.prepare('INSERT INTO task_events (task_id, event, message, at) VALUES (?,?,?,?)').run(
    taskId,
    event,
    message,
    new Date().toISOString()
  )
}

export function recordInteraction(db, { taskId = null, kind = 'note', content, source = 'cli', meta = null }) {
  db.prepare(
    'INSERT INTO interactions (task_id, kind, content, source, at, meta_json) VALUES (?,?,?,?,?,?)'
  ).run(taskId, kind, content, source, new Date().toISOString(), meta ? JSON.stringify(meta) : null)
}

export function taskFromMarkdown(dir, name) {
  const task = parseTask(path.join(dir, name))
  return {
    id: task.name,
    title: firstLine(task.raw),
    agent: sectionLine(task, 'agente'),
    module: sectionLine(task, 'módulo'),
    status: statusForDir(dir),
    scope_json: JSON.stringify(task.scope),
    depends_on: sectionLine(task, 'depende de'),
    baseline_json: baselineJson(task),
    criteria_json: null,
    complexity: sectionLine(task, 'complexidade')
  }
}

function statusForDir(dir) {
  const base = path.basename(dir)
  return base === 'queue' ? 'queue' : base === 'active' ? 'active' : 'done'
}

function firstLine(raw) {
  const m = raw.match(/^#\s+(.+)$/m)
  return m ? m[1].trim().replace(/^Task:\s*/i, '') : ''
}

function sectionLine(task, keyword) {
  const key = Object.keys(task.values ?? {}).find((k) => k.toLowerCase().includes(keyword))
  if (!key) return null
  const v = (task.values[key] ?? '')
    .replace(/^\[[ x]\]\s*/, '')
    .replace(/`/g, '')
    .trim()
  return v.slice(0, 200) || null
}

function baselineJson(task) {
  const key = Object.keys(task.sections).find((k) => k.toLowerCase().includes('baseline'))
  if (!key) return '[]'
  return JSON.stringify(task.sections[key].map((l) => l.trim().replace(/^[-*]\s*/, '').replace(/`/g, '')).filter(Boolean))
}

export function syncFromMarkdown(db, root) {
  const changed = []
  for (const [dir, status] of [
    [queueDir(root), 'queue'],
    [activeDir(root), 'active'],
    [doneDir(root), 'done']
  ]) {
    for (const name of listTasks(dir)) {
      const t = taskFromMarkdown(dir, name)
      const existing = db.prepare('SELECT status FROM tasks WHERE id = ?').get(name)
      upsertTask(db, t)
      if (!existing || existing.status !== status) {
        logEvent(db, name, 'synced', `markdown → ${status}`)
        changed.push({ id: name, to: status })
      }
    }
  }
  return changed
}

export function findDrift(db, root) {
  const rows = db.prepare('SELECT id, status FROM tasks').all()
  const drift = []
  for (const r of rows) {
    const loc = fileLocation(root, r.id)
    if (loc !== r.status) drift.push({ id: r.id, db: r.status, md: loc ?? '(arquivo ausente)' })
  }
  return drift
}

function fileLocation(root, id) {
  const dirs = [['queue', queueDir(root)], ['active', activeDir(root)], ['done', doneDir(root)]]
  for (const [status, dir] of dirs) {
    if (fs.existsSync(path.join(dir, id))) return status
  }
  return null
}

export function boardQuery(db) {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at').all()
  const cols = { queue: [], active: [], done: [] }
  for (const r of rows) {
    let scope = []
    try {
      scope = JSON.parse(r.scope_json ?? '[]')
    } catch {}
    cols[r.status]?.push({
      id: r.id,
      title: r.title,
      module: r.module,
      agent: r.agent,
      complexity: r.complexity,
      depends_on: r.depends_on,
      scope_count: scope.length,
      started_at: r.started_at,
      finished_at: r.finished_at
    })
  }
  return cols
}

export function taskHistory(db, taskId) {
  const events = db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY at').all(taskId)
  const interactions = db.prepare('SELECT * FROM interactions WHERE task_id = ? ORDER BY at').all(taskId)
  return { events, interactions }
}

export function resolveTaskId(root, arg) {
  if (!arg) return null
  for (const dir of [queueDir(root), activeDir(root), doneDir(root)]) {
    if (arg.endsWith('.md') && fs.existsSync(path.join(dir, arg))) return arg
    const matches = listTasks(dir).filter((n) => n.startsWith(arg + '-') || n.startsWith(arg + '.'))
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) throw new Error(`prefixo ambíguo "${arg}": ${matches.join(', ')}`)
  }
  return arg
}