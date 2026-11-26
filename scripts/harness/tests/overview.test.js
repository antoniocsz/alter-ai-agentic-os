// Tela Início (feature projetos-e-inicio, task 143): visão do projeto (GET /api/overview) e
// pipeline pela tela — criar task na fila e iniciar (start + worktree).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import { buildServe } from '../src/serve.js'
import { init } from '../src/init.js'
import { openDb, logEvent, recordInteraction } from '../src/lib/db.js'
import { startRun, finishRun } from '../src/lib/runs.js'
import { projectOverview } from '../src/lib/overview.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const task = (title, prio = 'P2', scope = '`src/a.js`') => `# Task: ${title}
## Agente: \`backend\` | Módulo: — | Prioridade: ${prio} | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- ${scope}
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

async function project(name, git = false) {
  const root = path.join(tmpdir(), name)
  await withSilentStdout(() => init([root, '--profile', 'script', ...(git ? ['--git'] : [])]))
  return root
}

test('visão do projeto: contagens, fila por prioridade, concluídas recentes com handoff e uso 7d', async () => {
  const root = await project('proj-ov')
  write(root, 'tasks/queue/05-cinco.md', task('Cinco', 'P2'))
  write(root, 'tasks/queue/06-seis.md', task('Seis', 'P0'))
  write(root, 'tasks/active/04-quatro.md', task('Quatro'))
  write(root, 'tasks/done/01-um.md', task('Um'))
  write(root, 'tasks/done/02-dois.md', task('Dois'))
  const db = openDb(root)
  try {
    logEvent(db, '01-um.md', 'finished')
    await new Promise((r) => setTimeout(r, 5))
    logEvent(db, '02-dois.md', 'finished')
    recordInteraction(db, { taskId: '02-dois.md', kind: 'note', content: 'handoff: fez o dois' })
    const id = startRun(db, { taskId: '04-quatro.md', tool: 'claude' })
    finishRun(db, id, { status: 'completed', exitCode: 0, usage: { tokensIn: 100, tokensOut: 20, costUsd: 0.25 } })
    const o = projectOverview(root, db)
    assert.deepEqual(o.stats, { queue: 2, active: 1, done: 2 })
    assert.deepEqual(o.queue.map((t) => [t.id, t.priority]), [['06-seis.md', 'P0'], ['05-cinco.md', 'P2']])
    assert.equal(o.active[0].title, 'Quatro')
    assert.deepEqual(o.recent.map((t) => [t.id, t.handoff]), [['02-dois.md', 'fez o dois'], ['01-um.md', null]])
    assert.equal(o.usage.runs, 1)
    assert.equal(o.usage.success_rate, 1)
    assert.equal(o.usage.cost_usd, 0.25)
    assert.equal(o.usage.tokens, 120)
  } finally {
    db.close()
  }
  const noDb = projectOverview(root, null)
  assert.equal(noDb.usage, null)
  assert.equal(noDb.recent.length, 2)
})

function call(h, method, url, { headers = {}, body } = {}) {
  const port = h.server.address().port
  const data = body === undefined ? null : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: url, headers: { host: `127.0.0.1:${port}`, ...(data !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } },
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

test('api: /api/overview, criar task na fila e iniciar com worktree', async () => {
  const root = await project('proj-ov-api', true)
  write(root, 'tasks/queue/07-pronta.md', task('Pronta'))
  const h = await withSilentStdout(async () => {
    const s = buildServe({ root, port: 0 })
    await once(s.server, 'listening')
    return s
  })
  const auth = { 'x-harness-token': h.sessionToken }
  try {
    const ov = await call(h, 'GET', '/api/overview')
    assert.equal(ov.status, 200, ov.raw)
    assert.equal(ov.json.stats.queue, 1)
    assert.equal(ov.json.name, 'proj-ov-api')

    assert.equal((await call(h, 'POST', '/api/pipeline/tasks', { body: { description: 'x' } })).status, 401)
    assert.equal((await call(h, 'POST', '/api/pipeline/tasks', { headers: auth, body: { description: '' } })).status, 400)
    assert.equal((await call(h, 'POST', '/api/pipeline/tasks', { headers: auth, body: { description: 'x', priority: 'P9' } })).status, 400)
    const created = await call(h, 'POST', '/api/pipeline/tasks', { headers: auth, body: { description: 'Exportar PDF', priority: 'P1' } })
    assert.equal(created.status, 201, created.raw)
    assert.match(created.json.file, /^tasks\/queue\/\d+-exportar-pdf\.md$/)
    const text = fs.readFileSync(path.join(root, created.json.file), 'utf8')
    assert.match(text, /Exportar PDF/)
    assert.match(text, /P1/)

    // Task inexistente: 422 com o motivo do pipeline.
    const missing = await call(h, 'POST', '/api/pipeline/start', { headers: auth, body: { task: '99' } })
    assert.equal(missing.status, 422, missing.raw)
    assert.ok(missing.json.error)

    const started = await call(h, 'POST', '/api/pipeline/start', { headers: auth, body: { task: '07' } })
    assert.equal(started.status, 200, started.raw)
    assert.equal(started.json.task, '07-pronta.md')
    assert.match(started.json.worktree.branch, /^task\/07-/)
    assert.ok(fs.existsSync(path.join(root, 'tasks/active/07-pronta.md')))
    assert.equal((await call(h, 'POST', '/api/pipeline/start', { headers: auth, body: { task: '07' } })).status, 422)
  } finally {
    await h.stop()
  }
})
