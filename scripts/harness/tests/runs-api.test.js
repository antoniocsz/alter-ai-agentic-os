// API local de execuções (feature api-local, task 115): `harness serve` dispara e para agentes
// com as mesmas regras do `harness run`, guardado por token de sessão + origem + Host.
// Runtime falso (fake-claude.js) — nada é simulado no harness: processo real, banco real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { buildServe, serveFile } from '../src/serve.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-claude.js')

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

const TASK = (n, slug) => `# Task: ${slug}
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/${slug}.js\`
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

/** Projeto com git: 07 ativa com worktree, 08 ativa sem worktree, 09 na fila. */
async function project() {
  const root = path.join(tmpdir(), 'proj-api')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  write(root, 'tasks/queue/07-exemplo.md', TASK(7, 'exemplo'))
  write(root, 'tasks/queue/08-sem-wt.md', TASK(8, 'sem-wt'))
  write(root, 'tasks/queue/09-fila.md', TASK(9, 'fila'))
  assert.equal(startTask(root, '07').ok, true)
  assert.equal(startTask(root, '08').ok, true)
  await withSilentStdout(() => startWorktree(root, '07'))
  return root
}

async function live(root, opts = {}) {
  const handles = await withSilentStdout(() => buildServe({ root, port: 0, ...opts }))
  await once(handles.server, 'listening')
  return handles
}

/** Requisição crua (permite forjar Host/Origin, o que o fetch não deixa). */
function call(handles, method, url, { headers = {}, body } = {}) {
  const port = handles.server.address().port
  const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: url,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(data !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
          ...headers
        }
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

test('api-local: runtimes, dispatch → 202 e run concluído, eventos incrementais por after', async () => {
  const root = await project()
  const h = await live(root, { env: fakeEnv() })
  try {
    const info = JSON.parse(fs.readFileSync(serveFile(root), 'utf8'))
    assert.equal(info.token, h.sessionToken, 'serve.json traz o token da sessão')
    assert.equal(info.pid, process.pid)
    assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/)

    const rt = await call(h, 'GET', '/api/runtimes')
    assert.equal(rt.status, 200)
    const claude = rt.json.runtimes.find((r) => r.tool === 'claude')
    assert.equal(claude.installed, true)
    assert.equal(rt.json.runtimes.find((r) => r.tool === 'opencode').requires_unsafe, true)
    assert.equal(rt.json.allow_unsafe, false)

    const empty = await call(h, 'GET', '/api/runs?task=07')
    assert.deepEqual([empty.status, empty.json.runs], [200, []])

    const started = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude', contextBudget: 0 } })
    assert.equal(started.status, 202, started.raw)
    const id = started.json.run.id
    assert.match(id, /^run-07-/)
    assert.equal(started.json.run.status, 'running')
    assert.equal(started.json.run.task_id, '07-exemplo.md')

    await h.runs.settled(id)
    const full = await call(h, 'GET', `/api/runs/${id}`)
    assert.equal(full.status, 200)
    assert.equal(full.json.run.status, 'completed')
    assert.equal(full.json.run.measured, true)
    const types = full.json.events.map((e) => e.type)
    assert.equal(types[0], 'run.started')
    assert.equal(types.at(-1), 'run.completed')
    assert.equal(full.json.events[0].native, undefined, 'native só com ?native=1')

    const mid = full.json.events[1].seq
    const tail = await call(h, 'GET', `/api/runs/${id}?after=${mid}`)
    assert.deepEqual(tail.json.events.map((e) => e.seq), full.json.events.filter((e) => e.seq > mid).map((e) => e.seq))
    const none = await call(h, 'GET', `/api/runs/${id}?after=${full.json.last_seq}`)
    assert.deepEqual([none.json.events, none.json.last_seq], [[], full.json.last_seq])

    const listed = await call(h, 'GET', '/api/runs?task=07')
    assert.deepEqual(listed.json.runs.map((r) => r.id), [id])

    assert.equal((await call(h, 'GET', '/api/runs/run-07-nao-existe')).status, 400)
    assert.equal((await call(h, 'GET', '/api/runs/run-07-20990101000000000')).status, 404)
  } finally {
    await h.stop()
  }
  assert.equal(fs.existsSync(serveFile(root)), false, 'serve.json removido ao encerrar')
})

test('api-local: guards — token, origem, Host, content-type, unsafe e validações do harness run', async () => {
  const root = await project()
  const h = await live(root, { env: fakeEnv() })
  try {
    const body = { task: '07', tool: 'claude' }
    assert.equal((await call(h, 'POST', '/api/runs', { body })).status, 401, 'sem token')
    assert.equal((await call(h, 'POST', '/api/runs', { body, headers: { 'x-harness-token': 'errado' } })).status, 401)
    assert.equal((await call(h, 'POST', '/api/runs', { body, headers: { ...auth(h), origin: 'http://evil.example' } })).status, 403)
    const rebinding = await call(h, 'GET', '/api/runs', { headers: { host: 'evil.example:4310' } })
    assert.equal(rebinding.status, 403, 'Host fora da lista (DNS rebinding) recusado também nas leituras')
    assert.equal((await call(h, 'POST', '/api/runs', { body: 'x=1', headers: { ...auth(h), 'content-type': 'text/plain' } })).status, 415)

    const unsafe = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { ...body, unsafe: true } })
    assert.equal(unsafe.status, 403)
    assert.match(unsafe.json.error, /--allow-unsafe/)

    const opencode = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'opencode' } })
    assert.equal(opencode.status, 422)
    assert.match(opencode.json.error, /exige --unsafe/)

    const queued = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '09', tool: 'claude' } })
    assert.equal(queued.status, 422)
    assert.match(queued.json.error, /task não está ativa/)

    const noWt = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '08', tool: 'claude' } })
    assert.equal(noWt.status, 422)
    assert.match(noWt.json.error, /task sem worktree/)

    const badTool = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'nada' } })
    assert.equal(badTool.status, 422)
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '../x', tool: 'claude' } })).status, 400)
    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude', unsafe: 'sim' } })).status, 400)
  } finally {
    await h.stop()
  }
})

test('api-local: stop interrompe o run em andamento; segundo dispatch na mesma task → 409; --allow-unsafe libera unsafe', async () => {
  const root = await project()
  const h = await live(root, { env: fakeEnv({ FAKE_HANG: '1' }), allowUnsafe: true })
  try {
    const started = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude', contextBudget: 0 } })
    assert.equal(started.status, 202, started.raw)
    const id = started.json.run.id

    const again = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'claude' } })
    assert.equal(again.status, 409)
    assert.match(again.json.error, /já há um run em andamento/)

    assert.equal((await call(h, 'POST', `/api/runs/${id}/stop`)).status, 401, 'parar também exige token')
    const stopped = await call(h, 'POST', `/api/runs/${id}/stop`, { headers: auth(h) })
    assert.deepEqual([stopped.status, stopped.json.ok], [200, true])
    await h.runs.settled(id)
    const run = (await call(h, 'GET', `/api/runs/${id}`)).json.run
    assert.deepEqual([run.status, run.error], ['failed', 'interrupted'])

    const late = await call(h, 'POST', `/api/runs/${id}/stop`, { headers: auth(h) })
    assert.equal(late.status, 409, 'run já terminado')

    // --allow-unsafe: opencode (exige unsafe) é aceito e fica marcado no run
    const oc = await call(h, 'POST', '/api/runs', { headers: auth(h), body: { task: '07', tool: 'opencode', unsafe: true, contextBudget: 0 } })
    assert.equal(oc.status, 202, oc.raw)
    assert.equal(oc.json.run.unsafe, true)
  } finally {
    await h.stop() // encerra o opencode pendurado (FAKE_HANG) antes de fechar
  }
  assert.equal(fs.existsSync(serveFile(root)), false)
})
