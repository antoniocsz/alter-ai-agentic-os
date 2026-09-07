import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { norm } from './tasks.js'

export function isGitRepo(root) {
  return fs.existsSync(path.join(root, '.git'))
}

function git(root, args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export function modifiedFiles(root) {
  if (!isGitRepo(root)) return []
  const out = git(root, 'status --porcelain=v1 -uall')
  const files = []
  for (const raw of out.split(/\r?\n/)) {
    if (!raw.trim()) continue
    let p = raw.slice(3)
    const arrow = p.indexOf(' -> ')
    if (arrow !== -1) p = p.slice(arrow + 4)
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
    if (p) files.push(norm(p))
  }
  return [...new Set(files)]
}

export function captureBaseline(root) {
  return modifiedFiles(root)
}

export function outOfScopeFiles(root, baseline, scope) {
  const current = modifiedFiles(root)
  const allowed = [...baseline, ...scope].map((p) => norm(p).replace(/\/+$/, ''))
  const out = []
  for (const file of current) {
    if (allowed.some((a) => file === a || file.startsWith(a + '/'))) continue
    out.push(file)
  }
  return out
}