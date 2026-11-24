import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { getRun, runEvents } from '../src/lib/runs.js'
import { runTool } from '../src/lib/runner.js'
import * as gemini from '../src/lib/runtimes/gemini.js'
import { driverFor } from '../src/run.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'runtimes')
const FAKE = path.join(FIXTURES, 'fake-claude.js') // executável falso genérico (lê FAKE_TRANSCRIPT)
const BIN = path.resolve(HERE, '../bin/harness.js')
const fixture = (name) => path.join(FIXTURES, 'gemini', name)

function envWith(extra = {}) {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'gemini.cmd'), `@"${process.execPath}" "${FAKE}" %*\r\n`)
  } else {
    fs.writeFileSync(path.join(dir, 'gemini'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    fs.chmodSync(path.join(dir, 'gemini'), 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

test('gemini.command: auto_edit por padrão, yolo só com unsafe; prompt nunca no argv', () => {
  assert.deepEqual(gemini.command(), ['--output-format', 'stream-json', '--approval-mode', 'auto_edit'])
  assert.deepEqual(gemini.command({ unsafe: true, model: 'gemini-2.5-pro' }), ['--output-format', 'stream-json', '--approval-mode', 'yolo', '--model', 'gemini-2.5-pro'])
  assert.equal(driverFor('gemini').id, 'gemini')
})

test('gemini.normalize: 6 tipos de evento; deltas acumulados; write_file → file_changed; uso medido sem custo', () => {
  const d = gemini.create()
  const events = []
  let meta = {}
  for (const l of fs.readFileSync(fixture('success.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    let obj
    try {
      obj = JSON.parse(l)
    } catch {
      continue
    }
    const out = d.normalize(obj)
    meta = { ...meta, ...out.meta }
    events.push(...out.events)
  }
  assert.deepEqual(events.map((e) => e.type), [
    'run.started',
    'agent.message', // eco do prompt (role user, sem texto)
    'agent.message', // "Vou criar o arquivo." (2 deltas)
    'agent.tool_call',
    'agent.file_changed',
    'agent.tool_result',
    'agent.tool_call',
    'agent.tool_result',
    'agent.error', // warning
    'agent.message', // "Pronto: src/a.js criado." (descarregado pelo result)
    'agent.usage'
  ])
  assert.equal(events[1].payload.role, 'user')
  assert.equal(events[2].payload.text, 'Vou criar o arquivo.')
  assert.deepEqual(events[2].native, { deltas: 2 })
  assert.deepEqual(events[4].payload, { path: 'src/a.js', tool: 'write_file' })
  assert.deepEqual([events[7].payload.is_error, events[7].payload.text], [true, '1 teste falhou'])
  assert.equal(events[8].payload.severity, 'warning')
  assert.equal(events[9].payload.text, 'Pronto: src/a.js criado.')
  assert.equal(meta.sessionId, 'gem-sess-1')
  assert.deepEqual(meta.usage, { tokensIn: 1500, tokensOut: 200, costUsd: null })
  assert.deepEqual(meta.final, { ok: true, reason: null })
  assert.equal(gemini.create().normalize({ type: 'evento_novo', x: 1 }).events[0].native.x, 1, 'desconhecido preservado')
})

test('runTool + gemini falso: prompt via stdin, sucesso medido; result error → failed', async () => {
  const root = tmpdir()
  const log = path.join(root, 'fake.log')
  const db = openDb(root)
  const ok = await runTool({ db, taskId: '07-x.md', cwd: root, driver: driverFor('gemini'), prompt: 'PROMPT GEMINI', env: envWith({ FAKE_TRANSCRIPT: fixture('success.jsonl'), FAKE_LOG: log }) })
  assert.equal(ok.status, 'completed')
  const called = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(called.stdin, 'PROMPT GEMINI')
  assert.ok(!called.argv.includes('PROMPT GEMINI'))
  const run = getRun(db, ok.runId)
  assert.deepEqual([run.tool, run.session_id, run.tokens_in, run.tokens_out, run.cost_usd, run.measured], ['gemini', 'gem-sess-1', 1500, 200, null, 1])
  assert.ok(runEvents(db, ok.runId).some((e) => e.native === 'linha de log do gemini que não é JSON'))

  const bad = await runTool({ db, taskId: '07-x.md', cwd: root, driver: driverFor('gemini'), prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: fixture('error.jsonl') }) })
  assert.equal(bad.status, 'failed')
  assert.match(getRun(db, bad.runId).error, /gemini: limite de turnos atingido/)
  db.close()
})

test('harness run --tool gemini (CLI): roda na worktree; --permission-mode recusado; --unsafe usa yolo', async () => {
  const root = path.join(tmpdir(), 'proj-gemini')
  await init([root, '--profile', 'script', '--git'])
  write(root, 'tasks/queue/07-x.md', `# Task: x
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Depende de: —
## Critério de conclusão:
- [ ] ok
`)
  assert.equal(startTask(root, '07').ok, true)
  const wt = startWorktree(root, '07')
  const cli = (args, extra = {}) => spawnSync(process.execPath, [BIN, ...args, '--no-context'], { cwd: root, encoding: 'utf8', env: envWith({ FAKE_TRANSCRIPT: fixture('success.jsonl'), ...extra }) })

  const log = path.join(tmpdir(), 'gem-cli.log')
  const ok = cli(['run', '07', '--tool', 'gemini'], { FAKE_LOG: log })
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.match(ok.stdout, /▶️ {2}run-07-\S+ · gemini/)
  assert.match(ok.stdout, /📝 src\/a\.js/)
  assert.match(ok.stdout, /✅ run-07-\S+ concluído · tokens 1500\/200 · custo n\/d \(medido\)/)
  const called = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(fs.realpathSync(called.cwd), fs.realpathSync(wt.dir))
  assert.deepEqual(called.argv.slice(2, 4), ['--approval-mode', 'auto_edit'])

  const flag = cli(['run', '07', '--tool', 'gemini', '--permission-mode', 'plan'])
  assert.notEqual(flag.status, 0)
  assert.match(flag.stderr, /--permission-mode só vale para --tool claude/)

  const ylog = path.join(tmpdir(), 'gem-yolo.log')
  assert.equal(cli(['run', '07', '--tool', 'gemini', '--unsafe'], { FAKE_LOG: ylog }).status, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(ylog, 'utf8')).argv.slice(2, 4), ['--approval-mode', 'yolo'])
})
