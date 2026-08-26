import fs from 'node:fs'
import path from 'node:path'

export const AGENTS_DIR = 'context/agents'

export const queueDir = (root) => path.join(root, AGENTS_DIR, 'queue')
export const activeDir = (root) => path.join(root, AGENTS_DIR, 'active')
export const doneDir = (root) => path.join(root, AGENTS_DIR, 'done')

export function listTasks(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

export const norm = (p) => p.replace(/\\/g, '/')

export function parseTask(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const name = path.basename(filePath)
  const sections = {}
  const values = {}
  const lines = content.split(/\r?\n/)
  let current = null
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      const heading = m[1].trim()
      const colon = heading.indexOf(':')
      if (colon !== -1) {
        const key = heading.slice(0, colon).trim()
        values[key] = heading.slice(colon + 1).trim()
        current = key
      } else {
        current = heading
      }
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }

  const scope = []
  const scopeKey = Object.keys(sections).find((k) => k.toLowerCase().startsWith('escopo'))
  if (scopeKey) {
    for (const line of sections[scopeKey]) {
      const bullet = line.trim().match(/^[-*]\s+(.*)$/)
      if (!bullet) continue
      let p = bullet[1].replace(/^\[[ x]\]\s*/, '').trim()
      p = p.replace(/^`|`$/g, '')
      p = p.replace(/['"]/g, '')
      if (p) scope.push(norm(p))
    }
  }

  return { name, filePath, scope, sections, values, raw: content }
}

export function pathsOverlap(a, b) {
  const x = norm(a)
  const y = norm(b)
  return x === y || x.startsWith(y + '/') || y.startsWith(x + '/')
}

export function findConflicts(tasks) {
  const conflicts = []
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const A = tasks[i]
      const B = tasks[j]
      if (!A.scope.length || !B.scope.length) continue
      for (const pa of A.scope) {
        for (const pb of B.scope) {
          if (pathsOverlap(pa, pb)) {
            conflicts.push({ a: A.name, b: B.name, aPath: pa, bPath: pb })
            break
          }
        }
      }
    }
  }
  return conflicts
}

export function moveTask(root, name, fromDir, toDir) {
  const from = path.join(fromDir, name)
  const to = path.join(toDir, name)
  if (!fs.existsSync(from)) throw new Error(`task não encontrada: ${from}`)
  if (fs.existsSync(to)) throw new Error(`já existe task em: ${to}`)
  fs.mkdirSync(toDir, { recursive: true })
  fs.renameSync(from, to)
  return to
}

export function taskLocation(root, name) {
  for (const [status, dir] of [
    ['queue', queueDir(root)],
    ['active', activeDir(root)],
    ['done', doneDir(root)]
  ]) {
    if (fs.existsSync(path.join(dir, name))) return status
  }
  return null
}

export function resolveTaskName(dir, arg) {
  if (!arg) throw new Error('informe o nome da task (ex: 04-api-routes-finance.md ou 04)')
  if (arg.endsWith('.md')) {
    if (!fs.existsSync(path.join(dir, arg))) throw new Error(`task não encontrada em ${path.basename(dir)}/: ${arg}`)
    return arg
  }
  const matches = listTasks(dir).filter((n) => n.startsWith(arg + '-') || n.startsWith(arg + '.'))
  if (matches.length === 0) throw new Error(`nenhuma task em ${path.basename(dir)}/ começa com "${arg}"`)
  if (matches.length > 1) {
    throw new Error(`prefixo ambíguo "${arg}": ${matches.join(', ')}`)
  }
  return matches[0]
}