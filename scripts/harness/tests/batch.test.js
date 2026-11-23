import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb, DB_DIR, DB_FILE } from '../src/lib/db.js'
import { listRuns, getRun, runEvents, newBatchId } from '../src/lib/runs.js'
import { planBatch, runBatch } from '../src/lib/batch.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { init } from '../src/init.js'
import { readRegistry } from '../src/lib/worktree.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '../bin/harness.js')
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

// Runtime falso (formato stream-json do Claude): registra início/fim em FAKE_TIMELINE,
// dorme FAKE_SLEEP_MS, falha (exit 2) se o cwd contém FAKE_FAIL e fica vivo com FAKE_HANG.
const FAKE_SRC = `
import fs from 'node:fs'
if (process.argv.includes('--version')) {
  process.stdout.write('fake 1.0.0\\n')
  process.exit(0)
}
let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (stdin += c))
process.stdin.on('end', () => {
  const log = (kind) => process.env.FAKE_TIMELINE && fs.appendFileSync(process.env.FAKE_TIMELINE, kind + ' ' + Date.now() + ' ' + process.cwd() + '\\n')
  log('S')
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-' + process.pid, model: 'fake' }) + '\\n')
  if (process.env.FAKE_HANG) return setInterval(() => {}, 1000)
  setTimeout(() => {
    const fail = process.env.FAKE_FAIL && process.cwd().includes(process.env.FAKE_FAIL)
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, session_id: 's', usage: { input_tokens: 10, output_tokens: 2 } }) + '\\n')
    log('E')
    process.exitCode = fail ? 2 : 0
  }, Number(process.env.FAKE_SLEEP_MS ?? 300))
})
`

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  const script = path.join(dir, 'fake-runtime.mjs')
  fs.writeFileSync(script, FAKE_SRC)
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${script}" %*\r\n`)
  } else {
    fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
    fs.chmodSync(path.join(dir, 'claude'), 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const taskMd = (title, scope, dep = '—') => `# Task: ${title}
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`${scope}\`
## Depende de: ${dep}
## Contexto para ler: —
## Skills a carregar: —
## O que já existe: —
## O que criar: —
## Especificação: —
## Critério de conclusão:
- [ ] ok
## Complexidade: baixa
`

function maxConcurrent(timeline) {
  const evs = fs
    .readFileSync(timeline, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split(' '))
    .map(([k, t]) => ({ k, t: Number(t) }))
    .sort((a, b) => a.t - b.t || (a.k === 'E' ? -1 : 1))
  let cur = 0
  let max = 0
  for (const e of evs) {
    cur += e.k === 'S' ? 1 : -1
    max = Math.max(max, cur)
  }
  return { max, starts: evs.filter((e) => e.k === 'S').length }
}

test('planBatch: recusa done/, ausente, repetida, dependência no lote e conflito de escopo — sem mover nada', () => {
  const root = tmpdir()
  write(root, 'tasks/queue/01-a.md', taskMd('a', 'src/a.js'))
  write(root, 'tasks/queue/02-a-de-novo.md', taskMd('a2', 'src/a.js'))
  write(root, 'tasks/queue/03-depende.md', taskMd('c', 'src/c.js', '`01`'))
  write(root, 'tasks/done/04-feita.md', taskMd('d', 'src/d.js'))
  write(root, 'tasks/active/05-ativa.md', taskMd('e', 'src/e.js'))
  write(root, 'tasks/queue/06-colide-ativa.md', taskMd('f', 'src/e.js'))
  const before = fs.readdirSync(path.join(root, 'tasks', 'queue')).sort()

  const { errors } = planBatch(root, ['01', '02', '03', '04', '99', '01', '06'])
  const by = (frag) => errors.filter((e) => e.error.includes(frag))
  assert.equal(by('já concluída').length, 1)
  assert.equal(by('não encontrada').length, 1)
  assert.equal(by('repetida').length, 1)
  assert.match(by('depende de')[0].error, /01-a\.md, que está no mesmo lote/)
  assert.ok(by('(no mesmo lote)').some((e) => /src\/a\.js/.test(e.error)), 'conflito interno 01 × 02')
  assert.ok(by('(ativa)').some((e) => e.name === '06-colide-ativa.md'), 'conflito com ativa fora do lote')
  assert.deepEqual(fs.readdirSync(path.join(root, 'tasks', 'queue')).sort(), before, 'nada foi movido')

  const ok = planBatch(root, ['05', '01'])
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.items.map((i) => [i.name, i.state, i.worktree]), [['05-ativa.md', 'active', false], ['01-a.md', 'queue', false]])
  assert.match(planBatch(root, []).errors[0].error, /lote vazio/)
})

test('runBatch: no máximo N simultâneos, todos concluídos, batch_id gravado', async () => {
  const root = tmpdir()
  const timeline = path.join(root, 'timeline.log')
  const db = openDb(root)
  const jobs = ['01-a.md', '02-b.md', '03-c.md', '04-d.md'].map((taskId) => {
    const cwd = path.join(root, 'wt', taskId)
    fs.mkdirSync(cwd, { recursive: true })
    return { taskId, cwd, driver: claude, prompt: `p ${taskId}` }
  })
  const batchId = newBatchId()
  const started = []
  const results = await runBatch({
    db, jobs, max: 2, batchId,
    env: fakeEnv({ FAKE_TIMELINE: timeline, FAKE_SLEEP_MS: '400' }),
    onStart: (j) => started.push(j.taskId)
  })
  assert.deepEqual(results.map((r) => r.status), ['completed', 'completed', 'completed', 'completed'])
  assert.deepEqual(results.map((r) => r.taskId), jobs.map((j) => j.taskId), 'resultado na ordem do lote')
  const { max, starts } = maxConcurrent(timeline)
  assert.equal(starts, 4)
  assert.ok(max <= 2, `concorrência ${max} > 2`)
  assert.equal(max, 2, 'paralelismo efetivo')
  const runs = listRuns(db, { batchId })
  assert.equal(runs.length, 4)
  assert.ok(runs.every((r) => r.batch_id === batchId && r.tokens_in === 10))
  assert.equal(listRuns(db, { batchId: 'batch-outro' }).length, 0)
  db.close()
})

test('runBatch: falha de uma task não interrompe as outras', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const jobs = ['01-ok.md', '02-quebra.md', '03-ok.md'].map((taskId) => {
    const cwd = path.join(root, 'wt', taskId)
    fs.mkdirSync(cwd, { recursive: true })
    return { taskId, cwd, driver: claude, prompt: 'x' }
  })
  const results = await runBatch({ db, jobs, max: 3, env: fakeEnv({ FAKE_FAIL: '02-quebra', FAKE_SLEEP_MS: '100' }) })
  assert.deepEqual(results.map((r) => r.status), ['completed', 'failed', 'completed'])
  assert.equal(results[1].exitCode, 2)
  db.close()
})

test('runBatch: abort do lote interrompe os ativos e não inicia os pendentes', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const jobs = ['01-a.md', '02-b.md', '03-c.md'].map((taskId) => {
    const cwd = path.join(root, 'wt', taskId)
    fs.mkdirSync(cwd, { recursive: true })
    return { taskId, cwd, driver: claude, prompt: 'x' }
  })
  const controller = new AbortController()
  const seen = new Set()
  const results = await runBatch({
    db, jobs, max: 2, env: fakeEnv({ FAKE_HANG: '1' }), signal: controller.signal,
    onEvent: (ev) => {
      seen.add(ev.taskId)
      if (seen.size === 2) controller.abort()
    }
  })
  assert.deepEqual(results.map((r) => r.status), ['failed', 'failed', 'skipped'])
  assert.deepEqual(results.slice(0, 2).map((r) => r.error), ['interrupted', 'interrupted'])
  assert.equal(results[2].runId, null)
  for (const r of results.slice(0, 2)) assert.equal(runEvents(db, r.runId).at(-1).payload.reason, 'interrupted')
  db.close()
})

test('migração: banco com runs sem batch_id ganha a coluna sem perder dados', () => {
  const root = tmpdir()
  fs.mkdirSync(path.join(root, DB_DIR), { recursive: true })
  const raw = new DatabaseSync(path.join(root, DB_DIR, DB_FILE))
  raw.exec(`CREATE TABLE runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tool TEXT NOT NULL, tool_version TEXT, model TEXT,
    session_id TEXT, status TEXT NOT NULL, pid INTEGER, cwd TEXT, exit_code INTEGER, started_at TEXT NOT NULL, finished_at TEXT,
    tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL, measured INTEGER NOT NULL DEFAULT 0, unsafe INTEGER NOT NULL DEFAULT 0, error TEXT);
    INSERT INTO runs (id, task_id, tool, status, started_at) VALUES ('run-old', '01-a.md', 'claude', 'completed', '2026-11-01T00:00:00.000Z');`)
  raw.close()
  const db = openDb(root)
  assert.equal(getRun(db, 'run-old').batch_id, null)
  assert.ok(db.prepare('PRAGMA table_info(runs)').all().some((c) => c.name === 'batch_id'))
  db.close()
  openDb(root).close() // idempotente
})

test('harness run --batch (CLI): prepara start + worktree, roda em paralelo e resume; falha → exit 1', async () => {
  const root = path.join(tmpdir(), 'proj-batch')
  await init([root, '--profile', 'script', '--git'])
  write(root, 'tasks/queue/01-a.md', taskMd('a', 'src/a.js'))
  write(root, 'tasks/queue/02-b.md', taskMd('b', 'src/b.js'))
  write(root, 'tasks/queue/03-c.md', taskMd('c', 'src/c.js'))
  const cli = (args, extra = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env: fakeEnv(extra) })

  const refused = cli(['run', '--batch', '01,99', '--tool', 'claude'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /lote recusado — nada foi preparado nem executado[\s\S]*99: task não encontrada/)
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'queue', '01-a.md')), 'recusa não move tasks')

  const timeline = path.join(tmpdir(), 'cli-timeline.log')
  const ok = cli(['run', '--batch', '01,02,03', '--tool', 'claude', '--max-parallel', '2'], { FAKE_TIMELINE: timeline, FAKE_SLEEP_MS: '300', FAKE_FAIL: 'task-03' })
  assert.equal(ok.status, 1, 'uma task falhou → exit 1')
  assert.match(ok.stdout, /🧩 batch-\d+ · claude · 3 task\(s\) · até 2 em paralelo/)
  assert.match(ok.stdout, /\[01\] 01-a\.md — start \+ worktree/)
  assert.match(ok.stdout, /✅ \[01\] 01-a\.md · run-01-/)
  assert.match(ok.stdout, /❌ \[03\] 03-c\.md · run-03-/)
  assert.ok(maxConcurrent(timeline).max <= 2)
  for (const t of ['01-a.md', '02-b.md', '03-c.md']) assert.ok(fs.existsSync(path.join(root, 'tasks', 'active', t)))
  assert.equal(readRegistry(root).worktrees.length, 3)

  const batchId = ok.stdout.match(/(batch-\d+)/)[1]
  const db = openDb(root)
  const runs = listRuns(db, { batchId })
  db.close()
  assert.deepEqual(runs.map((r) => r.status).sort(), ['completed', 'completed', 'failed'])

  // Reexecutar o lote reaproveita tasks ativas com worktree (nada a preparar).
  const again = cli(['run', '--batch', '01,02', '--tool', 'claude'], { FAKE_SLEEP_MS: '50' })
  assert.equal(again.status, 0, again.stderr + again.stdout)
  assert.match(again.stdout, /\[01\] 01-a\.md — já pronta/)
})
