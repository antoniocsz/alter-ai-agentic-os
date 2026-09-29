import fs from 'node:fs'
import path from 'node:path'
import { queueDir, activeDir, doneDir, listTasks } from './tasks.js'

export const WORKSPACE_FILE = '.harness-workspace.json'

export function findWorkspaceRoot(cwd) {
  if (process.env.HARNESS_WORKSPACE) {
    const fromEnv = path.resolve(process.env.HARNESS_WORKSPACE)
    if (fs.existsSync(path.join(fromEnv, WORKSPACE_FILE))) return fromEnv
  }
  let dir = path.resolve(cwd)
  for (;;) {
    if (fs.existsSync(path.join(dir, WORKSPACE_FILE))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function defaultRegistry(projectsDir = 'projects') {
  return { version: 1, harnessSource: null, projectsDir, projects: [] }
}

export function loadRegistry(root) {
  const file = path.join(root, WORKSPACE_FILE)
  if (!fs.existsSync(file)) {
    throw new Error(`não é um workspace (sem ${WORKSPACE_FILE}): ${root}`)
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`registro do workspace inválido (${file}): ${err.message}`)
  }
  const reg = {
    version: raw.version ?? 1,
    harnessSource: raw.harnessSource ?? null,
    projectsDir: raw.projectsDir ?? 'projects',
    projects: Array.isArray(raw.projects)
      ? raw.projects.map((p) => ({
          name: String(p.name ?? ''),
          path: path.resolve(root, p.path ?? '')
        }))
      : []
  }
  return reg
}

export function saveRegistry(root, reg) {
  const out = {
    version: reg.version ?? 1,
    harnessSource: reg.harnessSource ?? null,
    projectsDir: reg.projectsDir ?? 'projects',
    projects: reg.projects.map((p) => ({
      name: p.name,
      path: path.relative(root, p.path) || '.'
    }))
  }
  fs.writeFileSync(path.join(root, WORKSPACE_FILE), JSON.stringify(out, null, 2) + '\n')
}

export function resolveProject(reg, name) {
  if (!name) throw new Error('informe o nome do projeto')
  const found = reg.projects.find((p) => p.name.toLowerCase() === String(name).toLowerCase())
  if (!found) {
    const names = reg.projects.map((p) => p.name).join(', ') || '(nenhum)'
    throw new Error(`projeto não registrado: ${name}. Registrados: ${names}`)
  }
  return found
}

export function projectExists(reg, name, projectPath) {
  const n = String(name).toLowerCase()
  const p = path.resolve(projectPath)
  return reg.projects.some((x) => x.name.toLowerCase() === n || path.resolve(x.path) === p)
}

export function isHarnessProject(root) {
  return (
    fs.existsSync(path.join(root, 'scripts', 'harness', 'bin', 'harness.js')) &&
    fs.existsSync(path.join(root, 'context', 'agents'))
  )
}

export function harnessVersion(root) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(root, 'scripts', 'harness', 'package.json'), 'utf8')
    ).version
  } catch {
    return null
  }
}

export function projectStats(root) {
  const count = (dir) => listTasks(dir).length
  return {
    queue: count(queueDir(root)),
    active: count(activeDir(root)),
    done: count(doneDir(root))
  }
}