/**
 * Mudanças da task (feature `workspace-app`, task 140): o que a worktree da task mudou em
 * relação à base — commits da branch + alterações ainda não commitadas + arquivos novos.
 * Alimenta o painel "Mudanças" do Workspace (GET /api/changes). Só leitura: nada é alterado.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { baseBranch } from './worktree.js'

export const MAX_PATCH = 200 * 1024

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 })

/** Commit de referência: merge-base entre a base do projeto e o HEAD da worktree. */
function referenceOf(root, dir) {
  const base = baseBranch(root)
  try {
    return { base, ref: git(dir, ['merge-base', base, 'HEAD']).trim() }
  } catch {
    return { base, ref: 'HEAD' }
  }
}

function untracked(dir) {
  return git(dir, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
}

function countLines(file) {
  try {
    const buf = fs.readFileSync(file)
    if (buf.includes(0)) return null // binário
    const text = buf.toString('utf8')
    if (!text) return 0
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return null
  }
}

/**
 * Arquivos alterados: `{ base, files: [{ path, added, removed, status }] }`. `added`/`removed`
 * = null para binário. `status`: `added` (novo), `deleted`, `modified`.
 */
export function taskChanges(root, dir) {
  const { base, ref } = referenceOf(root, dir)
  const files = []
  const seen = new Set()
  const numstat = git(dir, ['diff', '--numstat', '-z', '--no-renames', ref])
  const parts = numstat.split('\0').filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(-|\d+)\t(-|\d+)\t(.+)$/s)
    if (!m) continue
    const file = m[3]
    const exists = fs.existsSync(path.join(dir, file))
    let status = 'modified'
    if (!exists) status = 'deleted'
    else {
      try {
        git(dir, ['cat-file', '-e', `${ref}:${file}`])
      } catch {
        status = 'added'
      }
    }
    files.push({ path: file, added: m[1] === '-' ? null : Number(m[1]), removed: m[2] === '-' ? null : Number(m[2]), status })
    seen.add(file)
  }
  for (const file of untracked(dir)) {
    if (seen.has(file)) continue
    files.push({ path: file, added: countLines(path.join(dir, file)), removed: 0, status: 'added' })
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { base, files }
}

/** Patch unificado de UM arquivo da lista de mudanças (recusa caminho fora da lista). */
export function filePatch(root, dir, file) {
  const { files } = taskChanges(root, dir)
  const entry = files.find((f) => f.path === file)
  if (!entry) return null
  const { ref } = referenceOf(root, dir)
  let patch
  if (entry.status === 'added' && untracked(dir).includes(file)) {
    const lines = entry.added === null ? null : fs.readFileSync(path.join(dir, file), 'utf8').replace(/\n$/, '').split('\n')
    patch = lines === null ? 'Arquivo binário novo' : [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => '+' + l)].join('\n')
  } else {
    patch = git(dir, ['diff', '--no-color', '--no-renames', ref, '--', file])
    // Só o corpo: a partir do primeiro hunk (o cabeçalho diff/index/---/+++ é ruído no painel).
    const at = patch.indexOf('\n@@')
    patch = at >= 0 ? patch.slice(at + 1) : patch.startsWith('@@') ? patch : patch.trim() || 'Sem diferenças de texto'
  }
  const truncated = patch.length > MAX_PATCH
  return { ...entry, patch: truncated ? patch.slice(0, MAX_PATCH) : patch, truncated }
}
