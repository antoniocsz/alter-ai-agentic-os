import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks, parseTask, findConflicts, moveTask, resolveTaskName } from './tasks.js'
import { captureBaseline, isGitRepo, outOfScopeFiles } from './git.js'
import { tryOpenDb, upsertTask, logEvent, taskFromMarkdown, recordInteraction } from './db.js'

export function startTask(root, arg) {
  const qDir = queueDir(root)
  const aDir = activeDir(root)
  const name = resolveTaskName(qDir, arg)

  if (fs.existsSync(path.join(aDir, name))) return { ok: false, error: `task já está ativa: ${name}` }

  const task = parseTask(path.join(qDir, name))
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))

  if (activeTasks.length > 0) {
    if (task.scope.length === 0) {
      return {
        ok: false,
        error:
          `task sem ## Escopo não pode rodar em paralelo com: ${activeTasks.map((t) => t.name).join(', ')}` +
          '\nadicione ## Escopo (arquivos que esta task vai tocar) à task e tente de novo.'
      }
    }
    const conflicts = findConflicts([task, ...activeTasks])
    if (conflicts.length > 0) {
      const c = conflicts[0]
      return {
        ok: false,
        error: `conflito de escopo com a task ativa ${c.b}:\n  ${c.aPath} ↔ ${c.bPath}`
      }
    }
  }

  const baseline = captureBaseline(root)
  const moved = moveTask(root, name, qDir, aDir)

  if (baseline.length > 0) {
    const lines = ['', '## Baseline (git)', ...baseline.map((f) => `- ${f}`)]
    fs.appendFileSync(moved, lines.join('\n') + '\n')
  }

  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(aDir, name))
      logEvent(db, name, 'started', `escopo: ${task.scope.length} arquivo(s)`)
    } catch {}
  }

  return { ok: true, name, task, parallel: activeTasks.map((t) => t.name) }
}

export function finishTask(root, arg, opts = {}) {
  const aDir = activeDir(root)
  const dDir = doneDir(root)
  const name = resolveTaskName(aDir, arg)
  const activePath = path.join(aDir, name)

  if (!fs.existsSync(activePath)) {
    const available = listTasks(aDir)
    return { ok: false, error: `task não está ativa: ${name}`, notFound: true }
  }
  if (fs.existsSync(path.join(dDir, name))) return { ok: false, error: `task já concluída: ${name}` }

  const task = parseTask(activePath)
  const baseline = parseBaseline(task)
  const activeTasks = listTasks(aDir).map((n) => parseTask(path.join(aDir, n)))
  const doneTasks = listTasks(dDir).map((n) => parseTask(path.join(dDir, n)))

  if (isGitRepo(root)) {
    const allowedScopes = [
      ...activeTasks.flatMap((t) => t.scope),
      ...doneTasks.flatMap((t) => t.scope),
      'context/'
    ]
    const out = outOfScopeFiles(root, baseline, allowedScopes)
    if (out.length > 0) {
      const db = tryOpenDb(root)
      if (db) {
        try {
          upsertTask(db, taskFromMarkdown(aDir, name))
          logEvent(db, name, 'out_of_scope', out.join('; '))
        } catch {}
      }
      return {
        ok: false,
        error: `fora do escopo declarado (${task.scope.length} arquivo(s)):\n  ${out.join('\n  ')}\n` +
          'reverta os arquivos fora do escopo ou adicione-os ao ## Escopo antes de concluir.',
        out
      }
    }
  }

  moveTask(root, name, aDir, dDir)

  const db = tryOpenDb(root)
  let handoff = false
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(dDir, name))
      logEvent(db, name, 'finished')
      if (opts.handoff) {
        recordInteraction(db, {
          taskId: name,
          kind: 'note',
          content: `handoff: ${opts.handoff}`,
          source: 'agent'
        })
        handoff = true
      }
    } catch {}
  }

  const modName = task.values?.['Módulo']?.match(/modules\/([a-z0-9-]+)/)?.[1] ?? null
  const statusPath = modName ? path.join(root, 'context', 'modules', modName, 'status.md') : null
  const hasHandoffBlock =
    statusPath && fs.existsSync(statusPath) ? /##\s*Handoff/i.test(fs.readFileSync(statusPath, 'utf8')) : false

  return { ok: true, name, task, gitRepo: isGitRepo(root), handoff, statusHandoffMissing: statusPath ? !hasHandoffBlock : null }
}

export function requeueTask(root, arg) {
  const aDir = activeDir(root)
  const qDir = queueDir(root)
  const name = resolveTaskName(aDir, arg)
  if (!fs.existsSync(path.join(aDir, name))) return { ok: false, error: `task não está ativa: ${name}` }
  moveTask(root, name, aDir, qDir)
  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(qDir, name))
      logEvent(db, name, 'requeued')
    } catch {}
  }
  return { ok: true, name }
}

export function reopenTask(root, arg) {
  const dDir = doneDir(root)
  const aDir = activeDir(root)
  const name = resolveTaskName(dDir, arg)
  if (!fs.existsSync(path.join(dDir, name))) return { ok: false, error: `task não está em done/: ${name}` }
  moveTask(root, name, dDir, aDir)
  const db = tryOpenDb(root)
  if (db) {
    try {
      upsertTask(db, taskFromMarkdown(aDir, name))
      logEvent(db, name, 'reopened')
    } catch {}
  }
  return { ok: true, name }
}

function parseBaseline(task) {
  const key = Object.keys(task.sections).find((k) => k.toLowerCase().includes('baseline'))
  if (!key) return []
  return task.sections[key]
    .map((line) => line.trim().replace(/^[-*]\s*/, '').replace(/`/g, ''))
    .filter(Boolean)
}