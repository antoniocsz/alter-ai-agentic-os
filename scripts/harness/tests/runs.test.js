import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb, syncFromMarkdown, DB_DIR, DB_FILE } from '../src/lib/db.js'
import {
  startRun,
  updateRun,
  appendRunEvent,
  finishRun,
  getRun,
  listRuns,
  runEvents,
  latestRun,
  reapOrphans,
  inFlightRuns,
  pidAlive,
  RUN_EVENT_TYPES
} from '../src/lib/runs.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(fileURLToPath(import.meta.url), '../../bin/harness.js')
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

// Token falso concatenado (mesmo padrão do redact.test.js) para não acionar o gate secrets.
const FAKE_SK = 'sk-' + 'abcdefghijklmnop1234'

const TASK = '07-exemplo.md'

const cli = (root, args) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })

test('migração: banco novo ganha runs/run_events; banco antigo é migrado sem perder dados', () => {
  const fresh = tmpdir()
  const db = openDb(fresh)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
  assert.ok(tables.includes('runs'))
  assert.ok(tables.includes('run_events'))
  db.close()

  // Banco "pré-task 93": só as tabelas antigas, com um evento de task.
  const old = tmpdir()
  fs.mkdirSync(path.join(old, DB_DIR), { recursive: true })
  const raw = new DatabaseSync(path.join(old, DB_DIR, DB_FILE))
  raw.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, event TEXT NOT NULL, message TEXT DEFAULT '', at TEXT NOT NULL);
    INSERT INTO meta VALUES ('schema_version', '1');
    INSERT INTO task_events (task_id, event, at) VALUES ('${TASK}', 'started', '2026-11-01T00:00:00.000Z');
  `)
  raw.close()

  const migrated = openDb(old)
  assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM task_events').get().n, 1)
  const runId = startRun(migrated, { taskId: TASK, tool: 'claude' })
  assert.equal(getRun(migrated, runId).status, 'running')
  migrated.close()
  // Reabrir é idempotente.
  openDb(old).close()
})

test('start/append/finish: seq monotônico, payload e native redigidos, usage medido', () => {
  const db = openDb(tmpdir())
  const runId = startRun(db, { taskId: TASK, tool: 'claude', pid: process.pid, cwd: '/wt' })
  assert.match(runId, /^run-07-\d{17}$/)
  updateRun(db, runId, { sessionId: 'sess-1', model: 'opus', toolVersion: '2.1.0' })

  assert.equal(appendRunEvent(db, runId, { type: 'run.started', payload: { session_id: 'sess-1' } }), 1)
  assert.equal(
    appendRunEvent(db, runId, {
      type: 'agent.tool_call',
      payload: { name: 'Bash', input: { command: `export KEY=${FAKE_SK}` } },
      native: { type: 'assistant', content: [{ text: `token ${FAKE_SK}` }] }
    }),
    2
  )
  assert.equal(appendRunEvent(db, runId, { type: 'agent.message', payload: 'linha não-JSON preservada' }), 3)

  finishRun(db, runId, { status: 'completed', exitCode: 0, usage: { tokensIn: 1200, tokensOut: 340, costUsd: 0.0123 } })

  const run = getRun(db, runId)
  assert.equal(run.status, 'completed')
  assert.equal(run.session_id, 'sess-1')
  assert.equal(run.model, 'opus')
  assert.equal(run.tokens_in, 1200)
  assert.equal(run.tokens_out, 340)
  assert.equal(run.cost_usd, 0.0123)
  assert.equal(run.measured, 1)
  assert.ok(run.finished_at)

  const events = runEvents(db, runId)
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3])
  assert.deepEqual(events.map((e) => e.type), ['run.started', 'agent.tool_call', 'agent.message'])
  const serialized = JSON.stringify(events)
  assert.ok(!serialized.includes(FAKE_SK), 'segredo não pode ir para o banco')
  assert.match(events[1].payload.input.command, /\[REDACTED\]/)
  assert.equal(events[1].payload.name, 'Bash', 'estrutura do payload preservada')
  assert.equal(events[2].payload, 'linha não-JSON preservada')
  db.close()
})

test('appendRunEvent: tipo fora da lista e run inexistente são rejeitados', () => {
  const db = openDb(tmpdir())
  const runId = startRun(db, { taskId: TASK, tool: 'codex' })
  assert.throws(() => appendRunEvent(db, runId, { type: 'agent.thinking' }), /tipo de evento de run inválido/)
  assert.throws(() => appendRunEvent(db, 'run-nao-existe', { type: 'agent.message' }), /run não encontrado/)
  assert.ok(RUN_EVENT_TYPES.every((t) => /^(run|agent|quality|user)\.[a-z_]+$/.test(t)))
  db.close()
})

test('finishRun sem usage: tokens/custo nulos e measured = 0 (nunca estimado)', () => {
  const db = openDb(tmpdir())
  const runId = startRun(db, { taskId: TASK, tool: 'opencode', unsafe: true })
  finishRun(db, runId, { status: 'failed', exitCode: 2, error: `falhou com ${FAKE_SK}` })
  const run = getRun(db, runId)
  assert.equal(run.tokens_in, null)
  assert.equal(run.tokens_out, null)
  assert.equal(run.cost_usd, null)
  assert.equal(run.measured, 0)
  assert.equal(run.unsafe, 1)
  assert.equal(run.exit_code, 2)
  assert.ok(!run.error.includes(FAKE_SK))
  assert.throws(() => finishRun(db, runId, { status: 'running' }), /status inválido/)
  db.close()
})

test('listRuns/latestRun: mais recente primeiro e filtro por task; ids únicos no mesmo instante', () => {
  const db = openDb(tmpdir())
  const fixed = 'run-07-20261120000000000'
  const a = startRun(db, { taskId: TASK, tool: 'claude', id: fixed })
  const b = startRun(db, { taskId: TASK, tool: 'claude', id: fixed })
  assert.notEqual(a, b)
  startRun(db, { taskId: '08-outra.md', tool: 'codex' })
  assert.equal(listRuns(db, { taskId: TASK }).length, 2)
  assert.equal(listRuns(db).length, 3)
  assert.equal(latestRun(db, '08-outra.md').tool, 'codex')
  assert.equal(latestRun(db, '99-nada.md'), null)
  db.close()
})

test('reapOrphans: run acompanhado por este processo (pid já morto, close pendente) não vira órfão (task 131)', () => {
  const db = openDb(tmpdir())
  const mine = startRun(db, { taskId: TASK, tool: 'claude', pid: 999 })
  inFlightRuns.add(mine)
  try {
    assert.deepEqual(reapOrphans(db, { isAlive: () => false }), [])
    assert.equal(getRun(db, mine).status, 'running')
  } finally {
    inFlightRuns.delete(mine)
  }
  assert.deepEqual(reapOrphans(db, { isAlive: () => false }), [mine])
  db.close()
})

test('reapOrphans: run running com pid morto (ou sem pid) vira failed/orphaned; vivo continua', () => {
  const db = openDb(tmpdir())
  const alive = startRun(db, { taskId: TASK, tool: 'claude', pid: 111 })
  const dead = startRun(db, { taskId: TASK, tool: 'claude', pid: 222 })
  const noPid = startRun(db, { taskId: TASK, tool: 'claude' })
  const done = startRun(db, { taskId: TASK, tool: 'claude', pid: 333 })
  finishRun(db, done, { status: 'completed', exitCode: 0 })

  const reaped = reapOrphans(db, { isAlive: (pid) => pid === 111 })
  assert.deepEqual(reaped.sort(), [dead, noPid].sort())
  assert.equal(getRun(db, alive).status, 'running')
  assert.equal(getRun(db, dead).status, 'failed')
  assert.equal(getRun(db, dead).error, 'orphaned')
  assert.equal(runEvents(db, dead).at(-1).type, 'run.failed')
  assert.equal(getRun(db, done).status, 'completed')

  assert.equal(pidAlive(process.pid), true)
  assert.equal(pidAlive(0), false)
  db.close()
})

test('sync do markdown não apaga runs nem run_events', () => {
  const root = tmpdir()
  write(root, `tasks/active/${TASK}`, '# Task: exemplo\n## Escopo:\n- `a.js`\n')
  const db = openDb(root)
  const runId = startRun(db, { taskId: TASK, tool: 'claude' })
  appendRunEvent(db, runId, { type: 'agent.message', payload: 'oi' })
  fs.rmSync(path.join(root, 'tasks', 'active', TASK))
  syncFromMarkdown(db, root)
  assert.ok(getRun(db, runId))
  assert.equal(runEvents(db, runId).length, 1)
  db.close()
})

test('CLI: harness runs --json e harness events <run> --json', () => {
  const root = tmpdir()
  write(root, `tasks/active/${TASK}`, '# Task: exemplo\n')
  const db = openDb(root)
  const runId = startRun(db, { taskId: TASK, tool: 'claude', pid: process.pid, model: 'opus' })
  appendRunEvent(db, runId, { type: 'agent.message', payload: { text: 'lendo a task' } })
  finishRun(db, runId, { status: 'completed', exitCode: 0, usage: { tokensIn: 10, tokensOut: 5 } })
  const other = startRun(db, { taskId: '08-outra.md', tool: 'codex', pid: process.pid })
  db.close()

  const all = cli(root, ['runs', '--json'])
  assert.equal(all.status, 0, all.stderr)
  const rows = JSON.parse(all.stdout)
  assert.deepEqual(rows.map((r) => r.id).sort(), [runId, other].sort())

  const filtered = cli(root, ['runs', '07', '--json'])
  assert.equal(filtered.status, 0, filtered.stderr)
  const [row] = JSON.parse(filtered.stdout)
  assert.equal(row.id, runId)
  assert.equal(row.usage, 'medido')
  assert.equal(row.cost_usd, null, 'custo ausente continua nulo mesmo com tokens medidos')

  const table = cli(root, ['runs'])
  assert.equal(table.status, 0, table.stderr)
  assert.match(table.stdout, new RegExp(runId))

  const ev = cli(root, ['events', runId, '--json'])
  assert.equal(ev.status, 0, ev.stderr)
  const parsed = JSON.parse(ev.stdout)
  assert.equal(parsed.run.id, runId)
  assert.equal(parsed.events[0].payload.text, 'lendo a task')

  const text = cli(root, ['events', runId])
  assert.match(text.stdout, /agent\.message — lendo a task/)

  const missing = cli(root, ['events', 'run-nao-existe'])
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /run não encontrado/)
})
