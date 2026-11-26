/**
 * Projetos do workspace para o seletor do Workspace (feature `seletor-projetos`, task 142).
 *
 * O projeto aberto pertence a um workspace quando alguma pasta acima tem `.harness-workspace.json`
 * (ou `HARNESS_WORKSPACE`). A lista traz os projetos registrados + o `harnessSource` (quando for
 * um projeto do harness), cada um com a contagem de tasks. Só leitura: trocar de projeto é com o
 * app desktop (ou `harness serve` na outra pasta).
 */
import fs from 'node:fs'
import path from 'node:path'
import { findWorkspaceRoot, loadRegistry, projectStats } from './workspace.js'

/** Pasta de projeto do harness: tem `harness.json` ou `.harness/`. */
export function looksLikeProject(dir) {
  try {
    return fs.existsSync(path.join(dir, 'harness.json')) || fs.existsSync(path.join(dir, '.harness'))
  } catch {
    return false
  }
}

const same = (a, b) => {
  const n = (p) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return n(a) === n(b)
}

function statsOf(dir) {
  try {
    return projectStats(dir)
  } catch {
    return null
  }
}

/** `{ current, workspace, projects }` — `projects` vazio quando não há workspace. */
export function listProjects(root) {
  const current = { name: path.basename(path.resolve(root)), root: path.resolve(root), stats: statsOf(root) }
  let wsRoot = null
  try {
    wsRoot = findWorkspaceRoot(root)
  } catch {}
  if (!wsRoot) return { current, workspace: null, projects: [] }
  let reg
  try {
    reg = loadRegistry(wsRoot)
  } catch (err) {
    return { current, workspace: { root: wsRoot, name: path.basename(wsRoot), error: err.message }, projects: [] }
  }
  const entries = []
  const add = (name, dir) => {
    if (!dir || entries.some((e) => same(e.root, dir))) return
    const exists = looksLikeProject(dir)
    entries.push({ name, root: dir, exists, current: same(dir, root), stats: exists ? statsOf(dir) : null })
  }
  // Registro gravado no Windows usa `\`: normaliza antes de resolver (no Windows `/` também vale).
  const resolveIn = (p) => path.resolve(wsRoot, String(p).replace(/\\/g, '/'))
  if (reg.harnessSource) add(path.basename(resolveIn(reg.harnessSource)), resolveIn(reg.harnessSource))
  for (const p of reg.projects) {
    const rel = path.isAbsolute(p.path) && !p.path.includes('\\') ? p.path : resolveIn(path.relative(wsRoot, p.path))
    add(p.name, rel)
  }
  if (!entries.some((e) => e.current)) entries.unshift({ ...current, exists: true, current: true })
  return { current, workspace: { root: wsRoot, name: path.basename(wsRoot) }, projects: entries }
}
