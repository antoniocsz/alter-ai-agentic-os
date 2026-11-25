// Orquestração encadeada pelo painel (feature orquestracao-encadeada, task 122): API local de
// fluxos no `harness serve` e estado do fluxo no cartão do canvas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { buildServe } from '../src/serve.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-flow-agent.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  for (const name of ['claude', 'opencode']) {
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

async function project() {
  const root = path.join(tmpdir(), 'proj-flow-api')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK)
  assert.equal(startTask(root, '07').ok, true)
  await withSilentStdout(() => startWorktree(root, '07'))
  return root
}

async function live(root, opts) {
  const h = await withSilentStdout(() => buildServe({ root, port: 0, ...opts }))
  await once(h.server, 'listening')
  return h
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

const auth = (h) => ({ 'x-harness-token': h.sessionToken })
const control = (verdicts) => {
  const dir = tmpdir()
  if (verdicts) fs.writeFileSync(path.join(dir, 'verdicts'), verdicts)
  return dir
}

test('api de fluxos: inicia em segundo plano, cartão mostra as etapas, pausa para aprovação e retoma com nota', async () => {
  const root = await project()
  const ctl = control('changes,approved')
  const h = await live(root, { env: fakeEnv({ FAKE_FLOW_DIR: ctl }) })
  try {
    const page = await call(h, 'GET', '/canvas')
    assert.match(page.raw, /🔗 Fluxo/)

    const body = { task: '07', implement: 'claude', review: 'claude', approve: 'review', noContext: true }
    assert.equal((await call(h, 'POST', '/api/flows', { body })).status, 401)
    const started = await call(h, 'POST', '/api/flows', { headers: auth(h), body })
    assert.equal(started.status, 202, started.raw)
    const id = started.json.flow.id
    assert.match(id, /^flow-07-/)

    const busy = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude' } })
    assert.equal(busy.status, 409, 'run avulso recusado enquanto o fluxo roda')

    await h.runs.flowSettled(id)
    let got = await call(h, 'GET', `/api/flows/${id}`)
    assert.equal(got.json.flow.status, 'waiting_approval')
    assert.deepEqual(got.json.steps.map((s) => [s.role, s.verdict]), [['implement', null], ['review', 'changes']])

    const canvas = await call(h, 'GET', '/api/canvas')
    const card = canvas.json.canvas.find((c) => c.id === '07-exemplo.md')
    assert.equal(card.flow.status, 'waiting_approval')
    assert.deepEqual(card.flow.steps.map((s) => s.role), ['implement', 'review'])

    const resumed = await call(h, 'POST', `/api/flows/${id}/resume`, { headers: auth(h), body: { note: 'trate a entrada vazia primeiro' } })
    assert.equal(resumed.status, 202, resumed.raw)
    await h.runs.flowSettled(id)
    got = await call(h, 'GET', `/api/flows/${id}`)
    assert.equal(got.json.flow.status, 'completed')
    const fixPrompt = fs.readdirSync(path.join(ctl, 'prompts')).find((f) => f.endsWith('-fix.txt'))
    assert.match(fs.readFileSync(path.join(ctl, 'prompts', fixPrompt), 'utf8'), /trate a entrada vazia primeiro/)

    const list = await call(h, 'GET', '/api/flows?task=07')
    assert.deepEqual(list.json.flows.map((f) => f.id), [id])
    assert.equal((await call(h, 'POST', `/api/flows/${id}/resume`, { headers: auth(h), body: {} })).status, 409, 'concluído não retoma')
  } finally {
    await h.stop()
  }
})

test('api de fluxos: validações, unsafe, stop durante a execução', async () => {
  const root = await project()
  const h = await live(root, { env: fakeEnv({ FAKE_FLOW_DIR: control('approved') }) })
  try {
    const bad = (body) => call(h, 'POST', '/api/flows', { headers: auth(h), body })
    assert.equal((await bad({ task: '07', implement: 'claude' })).status, 400, 'review obrigatório')
    assert.equal((await bad({ task: '07', implement: 'claude', review: 'claude', approve: 'sempre' })).status, 400)
    assert.equal((await bad({ task: '07', implement: 'opencode', review: 'claude' })).status, 422)
    assert.equal((await bad({ task: '07', implement: 'claude', review: 'claude', unsafe: true })).status, 403)
    assert.equal((await bad({ task: '99', implement: 'claude', review: 'claude' })).status, 422)
    assert.equal((await call(h, 'GET', '/api/flows/flow-07-x')).status, 400)
    assert.equal((await call(h, 'GET', '/api/flows/flow-07-20990101000000000')).status, 404)

    const started = await bad({ task: '07', implement: 'claude', review: 'claude', noContext: true })
    assert.equal(started.status, 202)
    const id = started.json.flow.id
    const stop = await call(h, 'POST', `/api/flows/${id}/stop`, { headers: auth(h) })
    assert.equal(stop.status, 200, stop.raw)
    await h.runs.flowSettled(id)
    const got = await call(h, 'GET', `/api/flows/${id}`)
    assert.equal(got.json.flow.status, 'stopped')
  } finally {
    await h.stop()
  }
})
