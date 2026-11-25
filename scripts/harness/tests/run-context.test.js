import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { init } from '../src/init.js'
import { openDb } from '../src/lib/db.js'
import { validateConfig, resolveConfig } from '../src/lib/config.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')

// Runtime falso (stream-json do Claude) que anexa {cwd, stdin} de cada execução em FAKE_PROMPTS.
const FAKE_SRC = `
import fs from 'node:fs'
if (process.argv.includes('--version')) { process.stdout.write('fake 1.0.0\\\\n'); process.exit(0) }
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.FAKE_PROMPTS, JSON.stringify({ cwd: process.cwd(), stdin }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's' }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's' }) + '\\n')
})
`

function fakeEnv(prompts) {
  const dir = tmpdir()
  const script = path.join(dir, 'fake.mjs')
  fs.writeFileSync(script, FAKE_SRC)
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${script}" %*\r\n`)
  } else {
    fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
    fs.chmodSync(path.join(dir, 'claude'), 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), FAKE_PROMPTS: prompts }
}

const taskMd = (title, scope) => `# Task: ${title}
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`${scope}\`
## Depende de: —
## Skills a carregar: codegen.md
## Critério de conclusão:
- [ ] ok
`

let root
before(async () => {
  root = path.join(tmpdir(), 'proj-ctx')
  await init([root, '--profile', 'script', '--git'])
  for (const [n, scope] of [['01-a', 'src/a.js'], ['02-b', 'src/b.js'], ['03-c', 'src/c.js'], ['04-d', 'src/d.js']]) {
    write(root, `tasks/queue/${n}.md`, taskMd(n, scope))
  }
})

const prompts = () => {
  const file = path.join(tmpdir(), 'prompts.jsonl')
  return { file, read: () => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) }
}
const cli = (args, env) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env })

test('run: anexa o pacote (sem repetir a task), registra context_built; --no-context e orçamento 0 desligam', () => {
  assert.equal(cli(['start', '01']).status, 0)
  assert.equal(cli(['worktree', 'start', '01']).status, 0)

  const p = prompts()
  const withCtx = cli(['run', '01', '--tool', 'claude'], fakeEnv(p.file))
  assert.equal(withCtx.status, 0, withCtx.stderr + withCtx.stdout)
  assert.match(withCtx.stdout, /📦 contexto: \d+ seção\(ões\) · ~\d+ tokens \(estimado\)/)
  const [first] = p.read()
  assert.match(first.stdin, /--- TASK ---[\s\S]*# Task: 01-a/)
  assert.match(first.stdin, /--- CONTEXTO DO PROJETO[\s\S]*# Pacote de contexto — 01-a\.md/)
  assert.match(first.stdin, /## \[rules\] Regras do projeto/)
  assert.match(first.stdin, /## \[skills\] Skills/)
  assert.ok(!first.stdin.includes('## [task]'), 'a task não é duplicada no pacote')

  const db = openDb(root)
  const ev = db.prepare("SELECT message FROM task_events WHERE task_id = '01-a.md' AND event = 'context_built'").all()
  db.close()
  assert.equal(ev.length, 1)
  assert.match(ev[0].message, /tokens \(estimado\)/)

  cli(['run', '01', '--tool', 'claude', '--no-context'], fakeEnv(p.file))
  cli(['run', '01', '--tool', 'claude', '--context-budget', '0'], fakeEnv(p.file))
  const [, noCtx, zero] = p.read()
  assert.ok(!noCtx.stdin.includes('CONTEXTO DO PROJETO'))
  assert.ok(!zero.stdin.includes('CONTEXTO DO PROJETO'))

  // Orçamento pequeno: o otimizador (task 132) resume as seções grandes antes de omitir; o que
  // nem resumido cabe sai e é listado no pacote.
  cli(['run', '01', '--tool', 'claude', '--context-budget', '400'], fakeEnv(p.file))
  const small = p.read().at(-1).stdin
  assert.match(small, /resumida \(não coube inteira\)|Omitidas por orçamento: /)

  const bad = cli(['run', '01', '--tool', 'claude', '--context-budget', '-1'], fakeEnv(p.file))
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /--context-budget inválido/)
})

test('harness.json context.budget: 0 desliga; valor inválido é reprovado pelo check', () => {
  const cfgFile = path.join(root, 'harness.json')
  const original = fs.readFileSync(cfgFile, 'utf8')
  try {
    fs.writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(original), context: { budget: 0 } }, null, 2))
    assert.equal(resolveConfig(root).context.budget, 0)
    const p = prompts()
    cli(['run', '01', '--tool', 'claude'], fakeEnv(p.file))
    assert.ok(!p.read()[0].stdin.includes('CONTEXTO DO PROJETO'))
  } finally {
    fs.writeFileSync(cfgFile, original)
  }
  assert.equal(resolveConfig(root).context.budget, 8000, 'padrão')
  assert.deepEqual(validateConfig({ profile: 'script', context: { budget: 100 } }), [])
  assert.ok(validateConfig({ profile: 'script', context: { budget: -5 } }).some((e) => e.includes('context.budget')))
  assert.ok(validateConfig({ profile: 'script', context: { budget: 1.5 } }).some((e) => e.includes('context.budget')))
})

test('run --batch: cada task recebe o próprio pacote; orçamento inválido recusa antes de preparar', () => {
  const p = prompts()
  const bad = cli(['run', '--batch', '02,03', '--tool', 'claude', '--context-budget', 'x'], fakeEnv(p.file))
  assert.notEqual(bad.status, 0)
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'queue', '02-b.md')), 'nada foi preparado')

  const ok = cli(['run', '--batch', '02,03', '--tool', 'claude', '--max-parallel', '2'], fakeEnv(p.file))
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.match(ok.stdout, /\[02\] 📦 contexto: /)
  assert.match(ok.stdout, /\[03\] 📦 contexto: /)
  const seen = p.read()
  assert.equal(seen.length, 2)
  for (const id of ['02-b', '03-c']) {
    const entry = seen.find((e) => e.cwd.includes(`task-${id.slice(0, 2)}`))
    assert.ok(entry, `prompt de ${id}`)
    assert.match(entry.stdin, new RegExp(`# Pacote de contexto — ${id}\\.md`))
  }
})
