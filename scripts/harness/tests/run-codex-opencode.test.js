import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { getRun, runEvents } from '../src/lib/runs.js'
import { runTool, childEnv } from '../src/lib/runner.js'
import * as codex from '../src/lib/runtimes/codex.js'
import * as opencode from '../src/lib/runtimes/opencode.js'
import { driverFor, buildPrompt } from '../src/run.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'runtimes')
const FAKE = path.join(FIXTURES, 'fake-claude.js') // executável falso genérico (lê FAKE_TRANSCRIPT)
const BIN = path.resolve(HERE, '../bin/harness.js')
const TASK = '07-exemplo.md'

/** PATH com `codex`/`opencode` falsos que reproduzem a transcrição em FAKE_TRANSCRIPT. */
function envWith(extra = {}) {
  const dir = tmpdir()
  for (const name of ['codex', 'opencode']) {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(dir, `${name}.cmd`), `@"${process.execPath}" "${FAKE}" %*\r\n`)
    } else {
      const file = path.join(dir, name)
      fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
      fs.chmodSync(file, 0o755)
    }
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const fixture = (...p) => path.join(FIXTURES, ...p)

function feed(driver, file) {
  const types = []
  let meta = {}
  for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    let obj
    try {
      obj = JSON.parse(l)
    } catch {
      continue
    }
    const out = driver.normalize(obj)
    meta = { ...meta, ...out.meta }
    types.push(...out.events.map((e) => e.type))
  }
  return { types, meta }
}

test('codex.command: workspace-write por padrão, danger-full-access só com unsafe, prompt por stdin (-)', () => {
  assert.deepEqual(codex.command(), ['exec', '--json', '--sandbox', 'workspace-write', '-'])
  assert.deepEqual(codex.command({ unsafe: true, model: 'gpt-5' }), ['exec', '--json', '--sandbox', 'danger-full-access', '--model', 'gpt-5', '-'])
})

test('codex.normalize: itens viram eventos; file_change expande por arquivo; uso soma turnos; custo nulo', () => {
  const { types, meta } = feed(codex.create(), fixture('codex', 'success.jsonl'))
  assert.deepEqual(types, [
    'run.started',
    'agent.message', // reasoning
    'agent.tool_call', // command started
    'agent.tool_result', // command completed
    'agent.file_changed',
    'agent.file_changed',
    'agent.tool_call', // mcp started
    'agent.tool_result', // mcp failed
    'agent.message', // agent_message
    'agent.message', // todo_list preservado
    'agent.usage'
  ])
  assert.equal(meta.sessionId, 'th_fake_1')
  assert.deepEqual(meta.usage, { tokensIn: 2000, tokensOut: 300, costUsd: null })
  assert.deepEqual(meta.final, { ok: true, reason: null })

  const d = codex.create()
  d.normalize({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 1 } })
  const second = d.normalize({ type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 2 } })
  assert.deepEqual(second.meta.usage, { tokensIn: 15, tokensOut: 3, costUsd: null }, 'acumula entre turnos')
  assert.deepEqual(codex.create().normalize({ type: 'turn.completed', usage: { input_tokens: 1 } }).meta.usage.tokensIn, 1, 'estado é por instância')

  const failed = d.normalize({ type: 'turn.failed', error: { message: 'boom' } })
  assert.deepEqual(failed.meta.final, { ok: false, reason: 'codex: boom' })
  assert.equal(d.normalize({ type: 'evento.novo', x: 1 }).events[0].native.x, 1, 'desconhecido preservado')
})

test('opencode.normalize: run.started só no 1º passo; edit vira file_changed; uso e custo somados por passo', () => {
  const { types, meta } = feed(opencode.create(), fixture('opencode', 'success.jsonl'))
  assert.deepEqual(types, [
    'run.started',
    'agent.message',
    'agent.tool_call',
    'agent.tool_result',
    'agent.file_changed',
    'agent.usage', // step tool-calls
    'agent.tool_call', // bash com erro (sem file_changed)
    'agent.tool_result',
    'agent.message',
    'agent.usage' // step stop
  ])
  assert.equal(meta.sessionId, 'ses_fake_1')
  // in = input + cache.read + cache.write; out = output + reasoning
  assert.deepEqual(meta.usage, { tokensIn: 800 + 200 + 400 + 100 + 10, tokensOut: 100 + 20 + 50, costUsd: 0.015 })
  assert.deepEqual(meta.final, { ok: true, reason: null })
  assert.deepEqual(opencode.command({ model: 'anthropic/claude-sonnet' }), ['run', '--format', 'json', '--model', 'anthropic/claude-sonnet'])

  const err = opencode.create().normalize({ type: 'error', error: { name: 'X', data: { message: 'no api key' } } })
  assert.deepEqual(err.meta.final, { ok: false, reason: 'opencode: no api key' })
})

test('runTool + codex falso: completed, prompt via stdin, argv com -, uso medido sem custo', async () => {
  const root = tmpdir()
  const log = path.join(root, 'fake.log')
  const db = openDb(root)
  const res = await runTool({
    db, taskId: TASK, cwd: root, driver: driverFor('codex'), prompt: 'PROMPT CODEX',
    env: envWith({ FAKE_TRANSCRIPT: fixture('codex', 'success.jsonl'), FAKE_LOG: log })
  })
  assert.equal(res.status, 'completed')
  const called = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(called.stdin, 'PROMPT CODEX')
  assert.equal(called.argv.at(-1), '-')
  const run = getRun(db, res.runId)
  assert.equal(run.tool, 'codex')
  assert.equal(run.session_id, 'th_fake_1')
  assert.deepEqual([run.tokens_in, run.tokens_out, run.cost_usd, run.measured], [2000, 300, null, 1])
  const events = runEvents(db, res.runId)
  assert.ok(events.some((e) => e.native === 'linha de log do codex que não é JSON'))
  assert.deepEqual(events.filter((e) => e.type === 'agent.file_changed').map((e) => e.payload.path), ['src/a.js', 'src/b.js'])

  const failed = await runTool({ db, taskId: TASK, cwd: root, driver: driverFor('codex'), prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: fixture('codex', 'failed.jsonl') }) })
  assert.equal(failed.status, 'failed')
  assert.match(getRun(db, failed.runId).error, /rate limit exceeded/)
  db.close()
})

test('runTool + opencode falso: completed com custo somado; evento de erro → failed', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const ok = await runTool({ db, taskId: TASK, cwd: root, driver: driverFor('opencode'), prompt: 'x', unsafe: true, env: envWith({ FAKE_TRANSCRIPT: fixture('opencode', 'success.jsonl') }) })
  assert.equal(ok.status, 'completed')
  const run = getRun(db, ok.runId)
  assert.deepEqual([run.tool, run.tokens_in, run.tokens_out, run.cost_usd, run.unsafe], ['opencode', 1510, 170, 0.015, 1])

  const bad = await runTool({ db, taskId: TASK, cwd: root, driver: driverFor('opencode'), prompt: 'x', unsafe: true, env: envWith({ FAKE_TRANSCRIPT: fixture('opencode', 'error.jsonl') }) })
  assert.equal(bad.status, 'failed')
  assert.match(getRun(db, bad.runId).error, /no api key/)
  db.close()
})

test('validação real Windows (task 113): PWD do filho = cwd; erro do opencode vira motivo; prompt protege tasks/', async () => {
  const root = tmpdir()
  const db = openDb(root)
  assert.equal(childEnv({ PWD: '/d/projetos', X: '1' }, 'C:\\wt').PWD, 'C:\\wt')
  const log = path.join(tmpdir(), 'log.json')
  const r = await runTool({
    db, taskId: TASK, cwd: root, driver: driverFor('opencode'), prompt: 'x', unsafe: true,
    env: envWith({ PWD: '/d/projetos', FAKE_EXIT: '1', FAKE_LOG: log, FAKE_TRANSCRIPT: fixture('opencode', 'real-pwd-error.jsonl') })
  })
  assert.equal(r.status, 'failed')
  assert.equal(getRun(db, r.runId).error, 'opencode: Failed to change directory to /d/projetos')
  const seen = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(fs.realpathSync(seen.pwd), fs.realpathSync(root), 'filho recebe PWD da worktree, não do chamador')
  db.close()
  assert.match(buildPrompt('07-x.md', 'corpo', { path: '/wt', branch: 'b' }), /NÃO mova nem edite arquivos de tasks\//)
})

test('harness run (CLI): opencode exige --unsafe; --permission-mode só para claude; codex roda na worktree', async () => {
  const root = path.join(tmpdir(), 'proj-run-96')
  await init([root, '--profile', 'script', '--git'])
  write(root, 'tasks/queue/07-exemplo.md', `# Task: exemplo
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Depende de: —
## Contexto para ler: —
## Skills a carregar: —
## O que já existe: —
## O que criar: —
## Especificação: —
## Critério de conclusão:
- [ ] ok
## Complexidade: baixa
`)
  assert.equal(startTask(root, '07').ok, true)
  const wt = startWorktree(root, '07')
  const cli = (args, extra = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env: envWith(extra) })

  const noUnsafe = cli(['run', '07', '--tool', 'opencode'], { FAKE_TRANSCRIPT: fixture('opencode', 'success.jsonl') })
  assert.notEqual(noUnsafe.status, 0)
  assert.match(noUnsafe.stderr, /--tool opencode exige --unsafe/)

  const badFlag = cli(['run', '07', '--tool', 'codex', '--permission-mode', 'plan'])
  assert.notEqual(badFlag.status, 0)
  assert.match(badFlag.stderr, /--permission-mode só vale para --tool claude/)

  const log = path.join(tmpdir(), 'codex-cli.log')
  const ok = cli(['run', '07', '--tool', 'codex'], { FAKE_TRANSCRIPT: fixture('codex', 'success.jsonl'), FAKE_LOG: log })
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.match(ok.stdout, /▶️ {2}run-07-\S+ · codex/)
  assert.match(ok.stdout, /📝 src\/b\.js/)
  assert.match(ok.stdout, /✅ run-07-\S+ concluído · tokens 2000\/300 · custo n\/d \(medido\)/)
  assert.equal(fs.realpathSync(JSON.parse(fs.readFileSync(log, 'utf8')).cwd), fs.realpathSync(wt.dir))

  const oc = cli(['run', '07', '--tool', 'opencode', '--unsafe'], { FAKE_TRANSCRIPT: fixture('opencode', 'success.jsonl') })
  assert.equal(oc.status, 0, oc.stderr + oc.stdout)
  assert.match(oc.stdout, /⚠️ {2}--unsafe: opencode/)
  assert.match(oc.stdout, /custo \$0\.0150 \(medido\)/)
})
