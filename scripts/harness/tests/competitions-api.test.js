// Execução competitiva pelo painel (feature execucao-competitiva, task 125): API local de
// competições no `harness serve` e estado no cartão do canvas.
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
import { execFileSync } from 'node:child_process'
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
  const root = path.join(tmpdir(), 'proj-comp-api')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK)
  assert.equal(startTask(root, '07').ok, true)
  const wt = await withSilentStdout(() => startWorktree(root, '07'))
  return { root, wtDir: wt.dir }
}

async function live(root, opts) {
  // O banner do kanban sai no evento 'listening': esperar dentro do silenciador (o stdout do
  // processo de teste é o canal do node:test — texto solto ali já corrompeu mensagem no CI).
  const h = await withSilentStdout(async () => {
    const started = buildServe({ root, port: 0, ...opts })
    await once(started.server, 'listening')
    return started
  })
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


test('api de competições: inicia em segundo plano, compara, juiz recomenda, pick aplica e cartão mostra o estado', async () => {
  const { root, wtDir } = await project()
  const h = await live(root, { env: fakeEnv({ FAKE_JUDGE_PICK: 'claude-2' }) })
  try {
    assert.match((await call(h, 'GET', '/canvas')).raw, /🏁 Competição/)
    const body = { task: '07', tools: ['claude:m-a', 'claude:m-b'], judge: 'claude', noContext: true }
    assert.equal((await call(h, 'POST', '/api/competitions', { body })).status, 401)
    const started = await call(h, 'POST', '/api/competitions', { headers: auth(h), body })
    assert.equal(started.status, 202, started.raw)
    const id = started.json.competition.id
    assert.match(id, /^comp-07-/)
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude' } })).status, 409, 'run avulso recusado durante a competição')
    assert.equal((await call(h, 'POST', `/api/competitions/${id}/pick`, { headers: auth(h), body: { key: 'claude' } })).status, 409, 'ainda rodando')

    await h.runs.compSettled(id)
    const got = await call(h, 'GET', `/api/competitions/${id}`)
    assert.equal(got.json.competition.status, 'ready')
    assert.equal(got.json.competition.judge_winner, 'claude-2')
    assert.deepEqual(got.json.competitors.map((c) => [c.key, c.status, c.files_changed]), [['claude', 'completed', 1], ['claude-2', 'completed', 1]])
    assert.equal(got.json.competitors[0].run.status, 'completed')

    const card = (await call(h, 'GET', '/api/canvas')).json.canvas.find((c) => c.id === '07-exemplo.md')
    assert.equal(card.competition.status, 'ready')
    assert.equal(card.competition.judge_winner, 'claude-2')

    assert.equal((await call(h, 'POST', `/api/competitions/${id}/pick`, { headers: auth(h), body: {} })).status, 400)
    const picked = await call(h, 'POST', `/api/competitions/${id}/pick`, { headers: auth(h), body: { key: 'claude-2' } })
    assert.equal(picked.status, 200, picked.raw)
    assert.equal(picked.json.competition.winner, 'claude-2')
    assert.match(fs.readFileSync(path.join(wtDir, 'src', 'a.js'), 'utf8'), /modelo m-b/)
    assert.deepEqual((await call(h, 'GET', '/api/competitions?task=07')).json.competitions.map((c) => c.status), ['picked'])
  } finally {
    await h.stop()
  }
})

test('api de competições: validações e discard', async () => {
  const { root } = await project()
  const h = await live(root, { env: fakeEnv() })
  try {
    const post = (body) => call(h, 'POST', '/api/competitions', { headers: auth(h), body })
    assert.equal((await post({ task: '07', tools: ['claude'] })).status, 400)
    assert.equal((await post({ task: '07', tools: 'claude,opencode' })).status, 422)
    assert.equal((await post({ task: '07', tools: 'claude,claude', unsafe: true })).status, 403)
    assert.equal((await post({ task: '99', tools: 'claude,claude' })).status, 422)
    assert.equal((await call(h, 'GET', '/api/competitions/comp-07-x')).status, 400)

    const started = await post({ task: '07', tools: 'claude,claude', noContext: true })
    assert.equal(started.status, 202, started.raw)
    const id = started.json.competition.id
    const discarded = await call(h, 'POST', `/api/competitions/${id}/discard`, { headers: auth(h) })
    assert.equal(discarded.status, 200, discarded.raw)
    assert.equal(discarded.json.competition.status, 'discarded')
    const branches = execFileSync('git', ['-C', root, 'branch', '--list', 'compete/*'], { encoding: 'utf8' })
    assert.equal(branches.trim(), '', 'branches das candidatas removidas')
  } finally {
    await h.stop()
  }
})
