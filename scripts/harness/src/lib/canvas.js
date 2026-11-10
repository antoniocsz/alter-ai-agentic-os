import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { tryOpenDb, boardQuery, syncFromMarkdown, taskHistory, taskFromMarkdown } from './db.js'
import { readRegistry, currentBranch } from './worktree.js'
import { activeDir, listTasks, norm } from './tasks.js'

// Staleness (AC-4): sem evento/interação nova neste intervalo → cartão stale.
export const STALE_MS = 15 * 60 * 1000

// Timeout defensivo: worktree enorme/travada não pode encostar o serve (fallback "n/d").
const GIT_TIMEOUT_MS = 2000

function gitStatusCount(dir) {
  if (!fs.existsSync(dir)) return null
  try {
    const out = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'status', '--porcelain'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GIT_TIMEOUT_MS }
    )
    return out.split('\n').filter(Boolean).length
  } catch {
    return 'n/d' // não-repo, timeout ou erro de git
  }
}

// Worktree registrada e presente no disco; caso contrário degrada para a raiz.
function worktreeOf(root, id, reg) {
  const entry = reg.worktrees.find((w) => w.task === id)
  const dir = entry ? path.join(root, entry.path) : null
  if (entry && fs.existsSync(dir)) {
    return { worktree: norm(entry.path), branch: entry.branch, dir }
  }
  let branch = null
  try {
    branch = currentBranch(root)
  } catch {}
  return { worktree: 'raiz', branch, dir: root }
}

function cardFor(t, proj, root, reg, db, now) {
  const wt = worktreeOf(root, t.id, reg)
  const history = db ? taskHistory(db, t.id) : { events: [], interactions: [] }
  const lastEvent = history.events.at(-1) ?? null
  const lastNote = history.interactions.filter((i) => i.kind === 'note').at(-1) ?? null

  // Valores são ISO normalizados do harness → comparação lexical vale como max().
  const activity = [t.started_at, lastEvent?.at, lastNote?.at].filter(Boolean)
  const lastActivityAt = activity.length ? activity.reduce((a, b) => (b > a ? b : a)) : null
  const startedMs = t.started_at ? Date.parse(t.started_at) : NaN

  return {
    id: t.id,
    title: t.title,
    agent: t.agent,
    project: proj.name || null,
    worktree: wt.worktree,
    branch: wt.branch,
    started_at: t.started_at ?? null,
    running_ms: Number.isFinite(startedMs) ? now - startedMs : null,
    changed_files: gitStatusCount(wt.dir),
    last_event: lastEvent
      ? { event: lastEvent.event, message: lastEvent.message, at: lastEvent.at }
      : null,
    last_note: lastNote ? { content: lastNote.content, at: lastNote.at } : null,
    last_activity_at: lastActivityAt,
    // Sem atividade alguma (db indisponível) → nada julgado, cartão normal.
    stale: lastActivityAt !== null && now - Date.parse(lastActivityAt) > STALE_MS
  }
}

/**
 * Estado "ao vivo" do canvas: um cartão por task em execução (coluna active),
 * com dados pré-computados (staleness, tempo, contagem) para a UI não recomputar.
 * Degradação graciosa: db indisponível → só markdown + git; worktree registrada
 * mas ausente no disco → raiz (campos de destaque ficam "n/d" conforme o payload).
 */
export function canvasState(ctx) {
  const now = Date.now()
  const cards = []
  for (const proj of ctx.projects) {
    const root = proj.root
    const reg = readRegistry(root)
    const db = tryOpenDb(root)
    if (db) {
      try {
        // markdown é a fonte da verdade — mesma diretriz do buildBoard
        syncFromMarkdown(db, root)
        for (const t of boardQuery(db).active) {
          cards.push(cardFor(t, proj, root, reg, db, now))
        }
      } finally {
        db.close()
      }
    } else {
      const dir = activeDir(root)
      for (const name of listTasks(dir)) {
        cards.push(cardFor(taskFromMarkdown(dir, name), proj, root, reg, null, now))
      }
    }
  }
  return { generated_at: new Date(now).toISOString(), canvas: cards }
}
