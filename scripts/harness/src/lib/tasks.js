import fs from 'node:fs'
import path from 'node:path'

export const TASKS_DIR = 'tasks'
export const LEGACY_AGENTS_DIR = 'context/agents'

/**
 * Raiz do pipeline: `tasks/` no layout v0.3, com fallback para
 * `context/agents/` em projetos gerados antes da migração.
 */
export function pipelineRoot(root) {
  const modern = path.join(root, TASKS_DIR)
  if (fs.existsSync(modern)) return modern
  const legacy = path.join(root, LEGACY_AGENTS_DIR)
  if (fs.existsSync(legacy)) return legacy
  return modern
}

export const queueDir = (root) => path.join(pipelineRoot(root), 'queue')
export const activeDir = (root) => path.join(pipelineRoot(root), 'active')
export const doneDir = (root) => path.join(pipelineRoot(root), 'done')

export function listTasks(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

export const norm = (p) => p.replace(/\\/g, '/')

export function parseTask(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const name = path.basename(filePath)
  const sections = {}
  const values = {}
  // Campos extras do header compacto (`## Agente: x | Tipo: docs`). Só entram em
  // `values` depois do loop, para que um heading dedicado (`## Tipo: docs`) em
  // qualquer posição do arquivo tenha precedência.
  const compact = {}
  const lines = content.split(/\r?\n/)
  let current = null
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/)
    if (m) {
      const heading = m[1].trim()
      const colon = heading.indexOf(':')
      if (colon !== -1) {
        const key = heading.slice(0, colon).trim()
        const { head, extra } = splitCompactHeader(heading.slice(colon + 1).trim())
        values[key] = head
        for (const [k, v] of Object.entries(extra)) if (!(k in compact)) compact[k] = v
        current = key
      } else {
        current = heading
      }
      sections[current] = []
      continue
    }
    if (current) sections[current].push(line)
  }

  for (const [k, v] of Object.entries(compact)) if (!(k in values)) values[k] = v

  const scope = []
  const scopeKey = Object.keys(sections).find((k) => k.toLowerCase().startsWith('escopo'))
  if (scopeKey) {
    for (const line of sections[scopeKey]) {
      const bullet = line.trim().match(/^[-*]\s+(.*)$/)
      if (!bullet) continue
      let p = bullet[1].replace(/^\[[ x]\]\s*/, '').trim()
      // Path anotado: o bullet é o PRIMEIRO bloco entre crases (`path` (NOVO) → path);
      // anotações depois do path são ignoradas. Sem crases (ou crase solta), mantém
      // o bloco inteiro do bullet — compatível com tasks antigas.
      p = p.match(/`([^`]+)`/)?.[1] ?? p
      p = p.replace(/^`|`$/g, '')
      p = p.replace(/['"]/g, '')
      if (p) scope.push(norm(p))
    }
  }

  return { name, filePath, scope, sections, values, raw: content }
}

const COMPACT_FIELD = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _-]{0,40}?)\s*:\s*(.*)$/

/**
 * Header compacto: `\`backend\` | Módulo: \`harness\` | Prioridade: P3 | Tipo: fix`.
 * O primeiro segmento é o valor do heading; os seguintes (`Campo: valor`) viram
 * campos extras, sem crases envolventes. Se algum segmento depois do primeiro não
 * tiver o formato `Campo: valor`, o valor fica intacto (não é header compacto).
 */
export function splitCompactHeader(value) {
  const parts = String(value).split(/\s+\|\s+/)
  if (parts.length < 2) return { head: value, extra: {} }
  const extra = {}
  for (const part of parts.slice(1)) {
    const m = part.trim().match(COMPACT_FIELD)
    if (!m) return { head: value, extra: {} }
    extra[m[1].trim()] = m[2].trim().replace(/^`([^`]*)`$/, '$1').trim()
  }
  return { head: parts[0].trim(), extra }
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
  if (/[\\/]/.test(arg) || arg.includes('..')) {
    throw new Error(`nome de task inválido: ${arg} (sem /, \\ ou ..)`)
  }
  if (arg.endsWith('.md')) {
    if (!fs.existsSync(path.join(dir, arg))) throw new Error(`task não encontrada em ${path.basename(dir)}/: ${arg}`)
    return arg
  }
  const prefixes = /^\d+$/.test(arg) ? [arg, arg.padStart(2, '0')] : [arg]
  const matches = listTasks(dir).filter((n) =>
    prefixes.some((p) => n.startsWith(p + '-') || n.startsWith(p + '.'))
  )
  if (matches.length === 0) throw new Error(`nenhuma task em ${path.basename(dir)}/ começa com "${arg}"`)
  if (matches.length > 1) {
    throw new Error(`prefixo ambíguo "${arg}": ${matches.join(', ')}`)
  }
  return matches[0]
}