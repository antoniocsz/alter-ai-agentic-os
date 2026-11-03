import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { norm } from './tasks.js'

export function isGitRepo(root) {
  return fs.existsSync(path.join(root, '.git'))
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

export function headSha(root) {
  try {
    return git(root, ['rev-parse', 'HEAD']).trim()
  } catch {
    return null
  }
}

export function modifiedFiles(root) {
  if (!isGitRepo(root)) return []
  let out
  try {
    out = git(root, ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-z', '-uall'])
  } catch {
    return []
  }

  const parts = out.split('\0')
  const files = []
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]
    if (!raw) continue
    const status = raw.slice(0, 2)
    const file = raw.slice(3)
    if (!file) continue
    files.push(norm(file))
    // R/C: o próximo campo é o caminho original
    if (status.includes('R') || status.includes('C')) i++
  }
  return [...new Set(files)]
}

export function diffNames(root, from, to = 'HEAD') {
  if (!from) return []
  try {
    const out = git(root, ['-c', 'core.quotePath=false', 'diff', '--name-only', '-z', from, to])
    return [...new Set(out.split('\0').filter(Boolean).map(norm))]
  } catch {
    return []
  }
}

export function captureBaseline(root) {
  return modifiedFiles(root)
}

export function outOfScopeFromFiles(files, baseline, scope) {
  const allowed = [...baseline, ...scope].map((p) => norm(p).replace(/\/+$/, ''))
  return files
    .map(norm)
    .filter((file) => !allowed.some((a) => file === a || file.startsWith(a + '/')))
}

export function outOfScopeFiles(root, baseline, scope) {
  return outOfScopeFromFiles(modifiedFiles(root), baseline, scope)
}
