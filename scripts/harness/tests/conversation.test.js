// Conversa contínua (feature conversa-continua, task 139): um run continua a sessão do agente de
// um run anterior (claude --resume, codex exec resume, opencode --session) pelo CLI e pela API.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildServe } from '../src/serve.js'
import { init } from '../src/init.js'
import { openDb } from '../src/lib/db.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { runEvents, getRun } from '../src/lib/runs.js'
import { ensureFlowSchema } from '../src/lib/flows.js'
import { conversationOf, resolveContinuation, validateMessage, buildContinuePrompt } from '../src/lib/conversation.js'
import * as claude from '../src/lib/runtimes/claude.js'
import * as codex from '../src/lib/runtimes/codex.js'
import * as opencode from '../src/lib/runtimes/opencode.js'
import * as gemini from '../src/lib/runtimes/gemini.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-chat-agent.js')
const BIN = path.resolve(HERE, '../bin/harness.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  for (const name of ['claude', 'codex']) {
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

const TASK = `# Task: exemplo
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
`

async function project(name) {
  const root = path.join(tmpdir(), name)
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK)
  assert.equal(startTask(root, '07').ok, true)
  await withSilentStdout(() => startWorktree(root, '07'))
  return root
}

const harness = (root, args, env) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8' })
const control = () => tmpdir()
const sent = (ctl, n) => JSON.parse(fs.readFileSync(path.join(ctl, `${n}.json`), 'utf8'))

test('drivers: retomada de sessão por tool', () => {
  assert.deepEqual(claude.command({ resume: 'abc-1' }).slice(0, 6), ['-p', '--output-format', 'stream-json', '--verbose', '--resume', 'abc-1'])
  assert.equal(claude.command().includes('--resume'), false)
  assert.deepEqual(codex.command({ resume: 'th-9', model: 'gpt-5' }), ['exec', '--json', '--sandbox', 'workspace-write', '--model', 'gpt-5', 'resume', 'th-9', '-'])
  assert.deepEqual(opencode.command({ resume: 'ses_1' }), ['run', '--format', 'json', '--session', 'ses_1'])
  assert.equal(claude.supportsResume && codex.supportsResume && opencode.supportsResume, true)
  assert.equal(gemini.supportsResume, false)
  assert.equal(claude.create().supportsResume, true)
})

test('mensagem e prompt da continuação', () => {
  assert.throws(() => validateMessage('   '), /mensagem obrigatória/)
  assert.throws(() => validateMessage('x'.repeat(20001)), /longa demais/)
  assert.equal(validateMessage('  oi  '), 'oi')
  const p = buildContinuePrompt('07-exemplo.md', 'use zod')
  assert.match(p, /Continuação da task 07-exemplo\.md/)
  assert.match(p, /MENSAGEM DO HUMANO ---\nuse zod$/)
})

test('cli: run --continue retoma a sessão, liga ao run anterior e abre com user.message', async () => {
  const root = await project('proj-chat-cli')
  const ctl = control()
  const env = fakeEnv({ FAKE_CHAT_DIR: ctl })

  let r = harness(root, ['run', '07', '--continue', '--message', 'oi'], env)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr + r.stdout, /nenhum run com sessão/)

  r = harness(root, ['run', '07', '--tool', 'claude', '--no-context'], env)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.equal(sent(ctl, 1).argv.includes('--resume'), false)

  r = harness(root, ['run', '07', '--continue', '--message', 'agora trate o vazio'], env)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /continuando a sessão de run-07-/)
  const second = sent(ctl, 2)
  assert.deepEqual(second.argv.slice(4, 6), ['--resume', 'sess-chat-1'])
  assert.match(second.stdin, /MENSAGEM DO HUMANO ---\nagora trate o vazio/)
  assert.doesNotMatch(second.stdin, /--- TASK ---/, 'a sessão já tem a task')

  r = harness(root, ['run', '07', '--continue', '--tool', 'codex', '--message', 'x'], env)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr + r.stdout, /é do claude/)
  r = harness(root, ['run', '07', '--continue'], env)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr + r.stdout, /mensagem obrigatória/)

  const db = openDb(root)
  try {
    const conv = conversationOf(db, '07-exemplo.md')
    assert.equal(conv.length, 2)
    const [first, cont] = conv
    assert.equal(first.parent_run_id, null)
    assert.equal(cont.parent_run_id, first.id)
    assert.equal(cont.session_id, 'sess-chat-1')
    assert.equal(cont.can_continue, true)
    assert.equal(cont.events[0].type, 'user.message')
    assert.equal(cont.events[0].payload.text, 'agora trate o vazio')
    assert.ok(cont.events.some((e) => e.type === 'agent.message' && e.payload.text === 'eco: agora trate o vazio'))
    assert.ok(cont.events.some((e) => e.type === 'agent.file_changed'))
    assert.equal(runEvents(db, first.id).some((e) => e.type === 'user.message'), false)

    // Continuar um run específico (o primeiro) também vale; run de outra task não.
    assert.equal(resolveContinuation(db, '07-exemplo.md', first.id).id, first.id)
    assert.throws(() => resolveContinuation(db, '08-outra.md', first.id), /é da task 07/)
    // Revisor (só leitura) não é continuado.
    ensureFlowSchema(db)
    db.prepare("INSERT INTO flows (id, task_id, status, plan_json, rounds, approve, created_at, updated_at) VALUES ('f', '07-exemplo.md', 'completed', '{}', 1, 'none', 'x', 'x')").run()
    db.prepare("INSERT INTO flow_steps (flow_id, seq, role, tool, run_id, status, started_at) VALUES ('f', 9, 'review', 'claude', ?, 'completed', 'x')").run(cont.id)
    assert.throws(() => resolveContinuation(db, '07-exemplo.md', cont.id), /revisor/)
    assert.equal(conversationOf(db, '07-exemplo.md')[1].can_continue, false)
    // Run em outra pasta (candidata de competição) não é continuado.
    assert.throws(() => resolveContinuation(db, '07-exemplo.md', first.id, path.join(root, 'outra')), /fora da worktree/)
    assert.equal(getRun(db, cont.id).tool, 'claude')
  } finally {
    db.close()
  }
})

async function live(root, opts) {
  return withSilentStdout(async () => {
    const started = buildServe({ root, port: 0, ...opts })
    await once(started.server, 'listening')
    return started
  })
}

function call(h, method, url, { headers = {}, body } = {}) {
  const port = h.server.address().port
  const data = body === undefined ? null : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, method, path: url,
        headers: { host: `127.0.0.1:${port}`, ...(data !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers }
      },
      (res) => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(raw)
          } catch {}
          resolve({ status: res.statusCode, json, raw })
        })
      }
    )
    req.on('error', reject)
    if (data !== null) req.write(data)
    req.end()
  })
}

test('api: POST /api/runs com continue + message e GET /api/conversation', async () => {
  const root = await project('proj-chat-api')
  const ctl = control()
  const h = await live(root, { env: fakeEnv({ FAKE_CHAT_DIR: ctl }) })
  const auth = { 'x-harness-token': h.sessionToken }
  try {
    const none = await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', continue: true, message: 'oi' } })
    assert.equal(none.status, 409, none.raw)

    const first = await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', contextBudget: 0 } })
    assert.equal(first.status, 202, first.raw)
    await h.runs.settled(first.json.run.id)

    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', continue: true } })).status, 400)
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', continue: 'nada', message: 'x' } })).status, 400)
    assert.equal((await call(h, 'POST', '/api/runs', { body: { task: '07', continue: true, message: 'x' } })).status, 401)

    const cont = await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', continue: first.json.run.id, message: 'segunda mensagem' } })
    assert.equal(cont.status, 202, cont.raw)
    assert.equal(cont.json.run.parent_run_id, first.json.run.id)
    await h.runs.settled(cont.json.run.id)
    assert.deepEqual(sent(ctl, 2).argv.slice(4, 6), ['--resume', 'sess-chat-1'])

    const conv = await call(h, 'GET', '/api/conversation?task=07')
    assert.equal(conv.status, 200, conv.raw)
    assert.equal(conv.json.task, '07-exemplo.md')
    assert.deepEqual(conv.json.runs.map((r) => r.parent_run_id), [null, first.json.run.id])
    assert.equal(conv.json.runs[1].events[0].payload.text, 'segunda mensagem')
    assert.equal((await call(h, 'GET', '/api/conversation')).status, 400)
  } finally {
    await h.stop()
  }
})
