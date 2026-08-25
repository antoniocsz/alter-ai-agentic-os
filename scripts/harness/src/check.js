import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { queueDir, activeDir, doneDir, listTasks, parseTask, findConflicts } from './lib/tasks.js'

const NAME_RE = /^\d{2,}-.+\.md$/
const REQUIRED_SECTIONS = ['agente', 'módulo', 'escopo', 'critério de conclusão']

export async function check(args) {
  const root = process.cwd()
  const json = args.includes('--json')
  const doBarrel = args.includes('--barrel')
  const doLint = args.includes('--lint')
  const doTypecheck = args.includes('--typecheck')

  const errors = []
  const add = (m) => errors.push(m)

  const qDir = queueDir(root)
  const aDir = activeDir(root)
  const dDir = doneDir(root)

  const q = listTasks(qDir)
  const a = listTasks(aDir)
  const d = listTasks(dDir)

  const all = { queue: q, active: a, done: d }
  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      if (!NAME_RE.test(n)) add(`[${dir}] nome inválido (esperado <nn>-<descricao>.md): ${n}`)
    }
  }

  const seen = new Map()
  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      if (seen.has(n)) add(`task em mais de uma pasta (${seen.get(n)} e ${dir}): ${n}`)
      else seen.set(n, dir)
    }
  }

  const activeTasks = a.map((n) => parseTask(path.join(aDir, n)))
  const conflicts = findConflicts(activeTasks)
  for (const c of conflicts) {
    add(`conflito de escopo entre tasks ativas: ${c.a} (${c.aPath}) ↔ ${c.b} (${c.bPath})`)
  }

  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      const task = parseTask(path.join(taskDir(root, dir), n))
      const keys = Object.keys(task.sections).map((k) => k.toLowerCase())
      for (const req of REQUIRED_SECTIONS) {
        if (!keys.some((k) => k.includes(req))) add(`[${dir}/${n}] seção obrigatória ausente: ${req}`)
      }
      const modName = extractModule(task.sections['Módulo']?.join(' ') ?? '')
      if (modName) {
        if (!fs.existsSync(path.join(root, 'context', 'modules', modName, 'context.md'))) {
          add(`[${dir}/${n}] módulo sem context.md: ${modName}`)
        }
        if (!fs.existsSync(path.join(root, 'context', 'modules', modName, 'status.md'))) {
          add(`[${dir}/${n}] módulo sem status.md: ${modName}`)
        }
      }
    }
  }

  for (const file of ['context/project/overview.md', 'context/project/stack.md']) {
    if (!fs.existsSync(path.join(root, file))) add(`projeto sem ${file}`)
  }
  if (!fs.existsSync(path.join(root, 'context', 'project', 'adr'))) {
    add('projeto sem context/project/adr/')
  }

  if (doBarrel) {
    const modules = path.join(root, 'packages', 'modules')
    if (fs.existsSync(modules)) {
      for (const m of fs.readdirSync(modules)) {
        if (m.startsWith('.')) continue
        const barrel = path.join(modules, m, 'src', 'index.ts')
        if (!fs.existsSync(barrel)) add(`módulo @saas/${m} sem barrel export (src/index.ts)`)
      }
    }
  }

  if (doLint) runCommand('pnpm turbo lint', root, add, 'lint')
  if (doTypecheck) runCommand('pnpm turbo typecheck', root, add, 'typecheck')

  if (json) {
    process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors }, null, 2) + '\n')
  } else {
    const summary = `tasks: ${q.length} queue / ${a.length} active / ${d.length} done`
    if (errors.length === 0) {
      process.stdout.write(`✅ harness ok — ${summary}\n`)
    } else {
      process.stdout.write(`❌ ${errors.length} violação(ões) — ${summary}\n`)
      for (const e of errors) process.stdout.write(`  - ${e}\n`)
    }
  }

  process.exit(errors.length === 0 ? 0 : 1)
}

function taskDir(root, dir) {
  return { queue: queueDir(root), active: activeDir(root), done: doneDir(root) }[dir]
}

function extractModule(text) {
  const m = text.match(/modules\/([a-z0-9-]+)/)
  if (m) return m[1]
  const s = text.match(/@saas\/([a-z0-9-]+)/)
  if (s) return s[1]
  const bare = text.match(/[a-z][a-z0-9-]{2,}/)
  return bare ? bare[0] : null
}

function runCommand(cmd, root, add, label) {
  try {
    execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    const out = (err.stdout || err.message || '').toString().trim()
    add(`${label} falhou:\n${out.split('\n').slice(0, 10).map((l) => '      ' + l).join('\n')}`)
  }
}