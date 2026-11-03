import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { activeDir, queueDir, resolveTaskName, norm, parseTask } from './tasks.js'
import { resolveConfig } from './config.js'
import { runGates, firstFailure } from './gates.js'
import { tryOpenDb, logEvent } from './db.js'
import { finishTask, parseBaseline } from './pipeline.js'
import { diffNames, outOfScopeFromFiles } from './git.js'
import { withLock } from './lock.js'
import { commitForTask, normalizeCommitType } from './commits.js'

export const worktreesDir = (root) => path.join(root, '.worktrees')
export const registryPath = (root) => path.join(root, '.harness', 'worktrees.json')

export function git(root, args, opts = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts
  })
}

export function isGitRepo(root) {
  try {
    git(root, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

export function readRegistry(root) {
  const file = registryPath(root)
  if (!fs.existsSync(file)) return { worktrees: [] }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return { worktrees: [] }
  }
}

function writeRegistry(root, reg) {
  const file = registryPath(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

export function currentBranch(root) {
  return git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
}

export function baseBranch(root) {
  const cfg = resolveConfig(root)
  if (cfg.git?.baseBranch) return cfg.git.baseBranch
  for (const candidate of ['main', 'master']) {
    try {
      git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`])
      return candidate
    } catch {}
  }
  return currentBranch(root)
}

function taskSlug(taskFile) {
  return taskFile.replace(/^\d+-/, '').replace(/\.md$/, '')
}

function taskNumber(taskFile) {
  return taskFile.match(/^(\d+)-/)?.[1] ?? '0'
}

export function startWorktree(root, arg) {
  return withLock(root, () => startWorktreeUnlocked(root, arg))
}

function startWorktreeUnlocked(root, arg) {
  if (!isGitRepo(root)) throw new Error('worktree exige repositório git')

  let name
  try {
    name = resolveTaskName(activeDir(root), arg)
  } catch {
    const inQueue = fs.existsSync(queueDir(root))
      ? fs.readdirSync(queueDir(root)).some((f) => f.endsWith('.md') && (f.startsWith(String(arg).padStart(2, '0')) || f.startsWith(String(arg))))
      : false
    throw new Error(
      `task não está ativa: ${arg}` +
        (inQueue ? `\n  rode primeiro: pnpm harness start ${arg}` : '')
    )
  }

  const reg = readRegistry(root)
  if (reg.worktrees.some((w) => w.task === name)) {
    throw new Error(`task já tem worktree: ${name}`)
  }

  const base = baseBranch(root)
  const n = taskNumber(name)
  const slug = taskSlug(name)
  const branch = `task/${n}-${slug}`
  const dir = path.join(worktreesDir(root), `task-${n}-${slug}`)

  if (fs.existsSync(dir)) throw new Error(`worktree já existe no disco: ${dir}`)

  git(root, ['worktree', 'add', '-b', branch, dir, base])

  const entry = {
    task: name,
    branch,
    path: norm(path.relative(root, dir)),
    base,
    created: new Date().toISOString()
  }
  reg.worktrees.push(entry)
  writeRegistry(root, reg)

  const db = tryOpenDb(root)
  if (db) {
    try {
      logEvent(db, name, 'worktree_started', `${branch} @ ${entry.path}`)
    } catch {}
  }

  return { entry, dir, base }
}

function resolveEntry(reg, arg) {
  const entries = reg.worktrees
  const exact = entries.find((w) => w.task === arg)
  if (exact) return exact

  const prefix = String(arg)
  const matches = entries.filter(
    (w) => w.task.startsWith(prefix) || w.task.startsWith(prefix.padStart(2, '0'))
  )
  if (matches.length === 0) throw new Error(`worktree não encontrada para: ${arg}`)
  if (matches.length > 1) {
    throw new Error(`prefixo ambíguo (${arg}): ${matches.map((w) => w.task).join(', ')}`)
  }
  return matches[0]
}

export function finishWorktree(root, arg, opts = {}) {
  return withLock(root, () => finishWorktreeUnlocked(root, arg, opts))
}

function finishWorktreeUnlocked(root, arg, opts = {}) {
  if (!isGitRepo(root)) throw new Error('worktree exige repositório git')

  const reg = readRegistry(root)
  const entry = resolveEntry(reg, arg)
  const wt = path.join(root, entry.path)
  if (!fs.existsSync(wt)) {
    throw new Error(`diretório da worktree não existe: ${entry.path} (rode worktree prune)`)
  }

  const dirty = git(wt, ['status', '--porcelain'])
  if (dirty.trim()) {
    git(wt, ['add', '-A'])
    git(wt, [
      '-c',
      'user.name=harness',
      '-c',
      'user.email=harness@local',
      'commit',
      '-m',
      `chore(${entry.branch}): trabalho da task`
    ])
  }

  const base = entry.base

  // Valida o escopo da worktree ANTES de rebase/merge (commit local não pode
  // esconder arquivos fora do ## Escopo).
  const activePath = path.join(activeDir(root), entry.task)
  let taskMeta = null
  try {
    taskMeta = parseTask(activePath)
  } catch {}
  if (taskMeta) {
    const taskBaseline = parseBaseline(taskMeta)
    const out = outOfScopeFromFiles(diffNames(wt, base, 'HEAD'), taskBaseline, [
      ...taskMeta.scope,
      'context/',
      'tasks/',
      '.worktrees/',
      '.tmp/'
    ])
    if (out.length > 0) {
      throw new Error(
        `fora do escopo na worktree (merge bloqueado):\n  ${out.join('\n  ')}\n` +
          `a worktree ${entry.path} foi preservada para inspeção.`
      )
    }
  }

  try {
    git(wt, ['rebase', base])
  } catch (err) {
    throw new Error(
      `rebase em ${base} falhou — resolva na worktree ${entry.path} e rode de novo.\n${String(err.stderr ?? '').trim()}`
    )
  }

  if (!opts.skipGates) {
    const cfg = resolveConfig(root)
    const gates = cfg.gates?.merge ?? []
    const results = runGates(wt, gates, { strict: cfg.gates?.strict })
    const failed = firstFailure(results)
    if (failed) {
      throw new Error(
        `gate "${failed.gate}" falhou na worktree ${entry.path} — corrija e rode de novo.\n${failed.output ?? ''}`
      )
    }
    opts.gates = results
  }

  const branch = currentBranch(root)
  if (branch !== base) {
    throw new Error(
      `repositório principal está em "${branch}"; troque para "${base}" antes de fazer o merge (a worktree foi preservada)`
    )
  }

  git(root, ['merge', '--squash', entry.branch])
  let hasStaged = true
  try {
    git(root, ['diff', '--cached', '--quiet'])
    hasStaged = false
  } catch {}
  if (hasStaged) {
    let commitType = 'feat'
    try {
      const activeTask = parseTask(path.join(activeDir(root), entry.task))
      commitType = normalizeCommitType(activeTask.values?.['Tipo'] ?? 'feat')
    } catch {}
    git(root, [
      '-c',
      'user.name=harness',
      '-c',
      'user.email=harness@local',
      'commit',
      '-m',
      commitForTask(entry.task, commitType)
    ])
  }

  const res = finishTask(root, entry.task, { handoff: opts.handoff ?? null })
  if (!res.ok) {
    throw new Error(`merge feito, mas o finish da task falhou: ${res.error}`)
  }

  if (!opts.keep) {
    git(root, ['worktree', 'remove', wt])
    try {
      git(root, ['branch', '-D', entry.branch])
    } catch {}
    const updated = readRegistry(root)
    updated.worktrees = updated.worktrees.filter((w) => w.task !== entry.task)
    writeRegistry(root, updated)
  }

  const db = tryOpenDb(root)
  if (db) {
    try {
      logEvent(db, entry.task, 'worktree_finished', entry.branch)
    } catch {}
  }

  return { entry, gates: opts.gates ?? [], finished: res }
}

export function listWorktrees(root) {
  return readRegistry(root).worktrees.map((w) => ({
    ...w,
    exists: fs.existsSync(path.join(root, w.path))
  }))
}

export function pruneWorktrees(root) {
  return withLock(root, () => {
    const reg = readRegistry(root)
    const removed = []
    reg.worktrees = reg.worktrees.filter((w) => {
      const exists = fs.existsSync(path.join(root, w.path))
      if (!exists) removed.push(w)
      return exists
    })
    writeRegistry(root, reg)
    if (isGitRepo(root)) {
      for (const entry of removed) {
        try {
          git(root, ['branch', '-D', entry.branch])
        } catch {}
      }
      try {
        git(root, ['worktree', 'prune'])
      } catch {}
    }
    return removed
  })
}
