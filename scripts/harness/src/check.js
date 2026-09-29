import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { queueDir, activeDir, doneDir, listTasks, parseTask, findConflicts } from './lib/tasks.js'
import { tryOpenDb, logEvent, recordInteraction, findDrift } from './lib/db.js'
import { findWorkspaceRoot, loadRegistry, isolationErrors } from './lib/workspace.js'

const NAME_RE = /^\d{2,}-.+\.md$/
const REQUIRED_SECTIONS = ['agente', 'módulo', 'escopo', 'critério de conclusão']

export function validate(root, opts = {}) {
  const db = tryOpenDb(root)
  const errors = []
  const add = (m, taskId = null) => {
    errors.push(m)
    if (db && taskId) {
      try {
        logEvent(db, taskId, 'check_violation', m)
      } catch {}
    }
  }

  const qDir = queueDir(root)
  const aDir = activeDir(root)
  const dDir = doneDir(root)

  const q = listTasks(qDir)
  const a = listTasks(aDir)
  const d = listTasks(dDir)

  const all = { queue: q, active: a, done: d }
  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      if (!NAME_RE.test(n)) add(`[${dir}] nome inválido (esperado <nn>-<descricao>.md): ${n}`, n)
    }
  }

  const seen = new Map()
  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      if (seen.has(n)) add(`task em mais de uma pasta (${seen.get(n)} e ${dir}): ${n}`, n)
      else seen.set(n, dir)
    }
  }

  const activeTasks = a.map((n) => parseTask(path.join(aDir, n)))
  const conflicts = findConflicts(activeTasks)
  for (const c of conflicts) {
    add(`conflito de escopo entre tasks ativas: ${c.a} (${c.aPath}) ↔ ${c.b} (${c.bPath})`, c.a)
    if (db) {
      try {
        logEvent(db, c.b, 'check_violation', `conflito de escopo com ${c.a}`)
      } catch {}
    }
  }

  for (const [dir, names] of Object.entries(all)) {
    for (const n of names) {
      const task = parseTask(path.join(taskDir(root, dir), n))
      const keys = Object.keys(task.sections).map((k) => k.toLowerCase())
      for (const req of REQUIRED_SECTIONS) {
        if (!keys.some((k) => k.includes(req))) add(`[${dir}/${n}] seção obrigatória ausente: ${req}`, n)
      }
      const modName = extractModule(task.values?.['Módulo'] ?? task.sections['Módulo']?.join(' ') ?? '')
      if (modName) {
        if (!fs.existsSync(path.join(root, 'context', 'modules', modName, 'context.md'))) {
          add(`[${dir}/${n}] módulo sem context.md: ${modName}`, n)
        }
        if (!fs.existsSync(path.join(root, 'context', 'modules', modName, 'status.md'))) {
          add(`[${dir}/${n}] módulo sem status.md: ${modName}`, n)
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

  if (opts.barrel) {
    const modules = path.join(root, 'packages', 'modules')
    if (fs.existsSync(modules)) {
      for (const m of fs.readdirSync(modules)) {
        if (m.startsWith('.')) continue
        const barrel = path.join(modules, m, 'src', 'index.ts')
        if (!fs.existsSync(barrel)) add(`módulo @<escopo>/${m} sem barrel export (src/index.ts)`)
      }
    }
  }

  if (opts.lint) runCommand('pnpm turbo lint', root, add, 'lint')
  if (opts.typecheck) runCommand('pnpm turbo typecheck', root, add, 'typecheck')

  if (opts.db) {
    if (!fs.existsSync(path.join(root, '.harness', 'harness.db'))) {
      add('banco .harness/harness.db não existe — rode `pnpm harness sync`')
    } else if (db) {
      const drift = findDrift(db, root)
      for (const d of drift) {
        add(`drift markdown × banco: ${d.id} (banco: ${d.db}, markdown: ${d.md})`, d.id)
      }
    }
  }

  if (db) {
    try {
      recordInteraction(db, {
        kind: 'system',
        content: `harness check: ${errors.length === 0 ? 'ok' : errors.length + ' violação(ões)'}`,
        source: 'cli'
      })
    } catch {}
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: `tasks: ${q.length} queue / ${a.length} active / ${d.length} done`
  }
}

export async function check(args) {
  const root = process.cwd()
  const json = args.includes('--json')

  // B3: `harness check` executado na raiz do workspace valida o isolamento do registro
  const wsRoot = findWorkspaceRoot(root)
  if (wsRoot && path.resolve(wsRoot) === path.resolve(root)) {
    return checkWorkspaceMode(root, args, json)
  }

  const res = validate(root, {
    barrel: args.includes('--barrel'),
    lint: args.includes('--lint'),
    typecheck: args.includes('--typecheck'),
    db: args.includes('--db')
  })

  if (json) {
    process.stdout.write(JSON.stringify({ ok: res.ok, errors: res.errors }, null, 2) + '\n')
  } else if (res.ok) {
    process.stdout.write(`✅ harness ok — ${res.summary}\n`)
  } else {
    process.stdout.write(`❌ ${res.errors.length} violação(ões) — ${res.summary}\n`)
    for (const e of res.errors) process.stdout.write(`  - ${e}\n`)
  }

  process.exit(res.ok ? 0 : 1)
}

function checkWorkspaceMode(root, args, json) {
  const reg = loadRegistry(root)
  const errors = isolationErrors(reg, root)
  const ok = errors.length === 0
  if (json) {
    process.stdout.write(JSON.stringify({ ok, errors }, null, 2) + '\n')
  } else if (ok) {
    process.stdout.write(
      `✅ workspace ok — registro válido (${reg.projects.length} projeto(s)).\n` +
        '   Para validar também os projetos: `harness workspace check --all`\n'
    )
  } else {
    process.stdout.write(`❌ ${errors.length} violação(ões) de isolamento no registro:\n`)
    for (const e of errors) process.stdout.write(`  - ${e}\n`)
  }
  process.exit(ok ? 0 : 1)
}

function taskDir(root, dir) {
  return { queue: queueDir(root), active: activeDir(root), done: doneDir(root) }[dir]
}

function extractModule(text) {
  const m = text.match(/modules\/([a-z0-9-]+)/)
  if (m) return m[1]
  const at = text.match(/@[a-z0-9<>-]+\/([a-z0-9-]+)/)
  if (at) return at[1]
  if (/[/<>]/.test(text)) return null
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