// Modo Analisar (feature modo-analisar, task 141): pergunta só leitura (role ask + guarda da
// worktree), achados `arquivo:linha` da revisão e a conversa que pula runs só leitura.
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
import { conversationOf, resolveContinuation } from '../src/lib/conversation.js'
import { parseFindings, verdictOf, taskFindings } from '../src/lib/findings.js'
import { startRun, appendRunEvent, finishRun } from '../src/lib/runs.js'
import { buildPrompt } from '../src/run.js'
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


test('achados: arquivo:linha em listas, crases, intervalos; veredito', () => {
  const text = [
    'Revisei a mudança.',
    '1. `src/ui/Login.tsx:15` — erro de rede não é tratado',
    '- src/api/auth.ts:42-48: mensagem vazia em 500',
    '* **src/a.js:3** - nome confuso',
    'veja docs/x.md:abc (não é linha)',
    '- ../fora.js:1 — fora da raiz',
    'VEREDITO: MUDANÇAS'
  ].join('\n')
  assert.deepEqual(parseFindings(text), [
    { file: 'src/ui/Login.tsx', line: 15, end: null, text: 'erro de rede não é tratado' },
    { file: 'src/api/auth.ts', line: 42, end: 48, text: 'mensagem vazia em 500' },
    { file: 'src/a.js', line: 3, end: null, text: 'nome confuso' }
  ])
  assert.equal(verdictOf(text), 'changes')
  assert.equal(verdictOf('ok\nVEREDITO: APROVADO'), 'approved')
  assert.equal(verdictOf('nada'), null)
  assert.deepEqual(parseFindings(''), [])
})

test('prompt da pergunta: só leitura, cita arquivo:linha; revisor pede o mesmo formato', () => {
  const wt = { path: '.worktrees/x', branch: 'task/x' }
  const ask = buildPrompt('07-x.md', '# Task', wt, null, { role: 'ask', extra: '--- PERGUNTA DO HUMANO ---\nonde quebra?' })
  assert.match(ask, /ANALISANDO o código/)
  assert.match(ask, /NÃO altere/)
  assert.match(ask, /PERGUNTA DO HUMANO ---\nonde quebra\?/)
  const review = buildPrompt('07-x.md', '# Task', wt, null, { role: 'review' })
  assert.match(review, /`caminho\/arquivo:linha —`/)
})

test('achados da task: revisão mais recente (role review) com veredito', async () => {
  const root = await project('proj-findings')
  const db = openDb(root)
  try {
    assert.deepEqual(taskFindings(db, '07-exemplo.md'), { source: null, verdict: null, findings: [] })
    const id = startRun(db, { taskId: '07-exemplo.md', tool: 'codex', role: 'review' })
    appendRunEvent(db, id, { type: 'agent.message', payload: { text: 'Pontos:\n1. src/a.js:2 — trate o vazio\nVEREDITO: MUDANÇAS', final: true } })
    finishRun(db, id, { status: 'completed', exitCode: 0 })
    const got = taskFindings(db, '07-exemplo.md')
    assert.equal(got.source.run_id, id)
    assert.equal(got.verdict, 'changes')
    assert.deepEqual(got.findings, [{ file: 'src/a.js', line: 2, end: null, text: 'trate o vazio' }])
  } finally {
    db.close()
  }
})

test('cli: --ask roda só leitura, marca role ask, avisa se a worktree mudou e não vira alvo do --continue', async () => {
  const root = await project('proj-ask-cli')
  const ctl = control()
  const env = fakeEnv({ FAKE_CHAT_DIR: ctl })
  let r = harness(root, ['run', '07', '--tool', 'claude', '--no-context'], env)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  r = harness(root, ['run', '07', '--tool', 'claude', '--no-context', '--ask', 'onde isso quebra?'], env)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const asked = sent(ctl, 2)
  assert.ok(asked.argv.includes('plan'), 'claude em --permission-mode plan')
  assert.match(asked.stdin, /ANALISANDO o código/)
  assert.match(asked.stdin, /PERGUNTA DO HUMANO ---\nonde isso quebra\?/)
  r = harness(root, ['run', '07', '--tool', 'claude', '--ask', ' '], env)
  assert.notEqual(r.status, 0)

  const db = openDb(root)
  try {
    const conv = conversationOf(db, '07-exemplo.md')
    const ask = conv.find((x) => x.role === 'ask')
    assert.ok(ask)
    assert.equal(ask.can_continue, false)
    assert.equal(ask.events[0].type, 'user.message')
    // O agente falso escreve na worktree: a guarda registra a violação.
    assert.ok(ask.events.some((e) => e.type === 'agent.error' && e.payload.read_only_violation), 'guarda de só leitura')
    // --continue sem id pula a pergunta e continua o run de escrita.
    const write = conv.find((x) => x.role === 'implement')
    assert.equal(resolveContinuation(db, '07-exemplo.md', null).id, write.id)
    assert.throws(() => resolveContinuation(db, '07-exemplo.md', ask.id), /modo Analisar/)
  } finally {
    db.close()
  }
})

test('api: ask no POST /api/runs e GET /api/findings', async () => {
  const root = await project('proj-ask-api')
  const ctl = control()
  const h = await live(root, { env: fakeEnv({ FAKE_CHAT_DIR: ctl }) })
  const auth = { 'x-harness-token': h.sessionToken }
  try {
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', ask: '' } })).status, 400)
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', ask: 'x', note: 'y' } })).status, 400)
    const run = await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', contextBudget: 0, ask: 'o que mudou?' } })
    assert.equal(run.status, 202, run.raw)
    await h.runs.settled(run.json.run.id)
    assert.ok(sent(ctl, 1).argv.includes('plan'))
    const conv = await call(h, 'GET', '/api/conversation?task=07')
    assert.equal(conv.json.runs[0].role, 'ask')
    const f = await call(h, 'GET', '/api/findings?task=07')
    assert.equal(f.status, 200, f.raw)
    assert.equal(f.json.source, null)
    assert.equal((await call(h, 'GET', '/api/findings')).status, 400)
  } finally {
    await h.stop()
  }
})
