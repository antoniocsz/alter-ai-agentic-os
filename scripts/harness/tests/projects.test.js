// Seletor de projetos (feature seletor-projetos, task 142): projetos do workspace com contagem de
// tasks (GET /api/projects) e validação do pedido de troca no app desktop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'
import { listProjects, looksLikeProject } from '../src/lib/projects.js'
import { buildServe } from '../src/serve.js'
import { init } from '../src/init.js'
import { validProjectRequest } from '../../../apps/desktop/src/core.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

function project(dir, { queue = 0, active = 0, done = 0 } = {}) {
  write(dir, 'harness.json', '{}\n')
  for (const [k, n] of [['queue', queue], ['active', active], ['done', done]]) {
    fs.mkdirSync(path.join(dir, 'tasks', k), { recursive: true })
    for (let i = 1; i <= n; i++) write(dir, `tasks/${k}/${String(i).padStart(2, '0')}-t.md`, '# t\n')
  }
}

function workspace() {
  const ws = tmpdir()
  project(path.join(ws, 'harness'), { done: 3 })
  project(path.join(ws, 'workspace', 'kanban'), { queue: 2, active: 1 })
  project(path.join(ws, 'workspace', 'editor'), { done: 1 })
  write(ws, '.harness-workspace.json', JSON.stringify({
    version: 1,
    harnessSource: 'harness',
    projectsDir: 'workspace',
    projects: [
      { name: 'kanban', path: 'workspace\\kanban' }, // gravado no Windows
      { name: 'editor', path: 'workspace/editor' },
      { name: 'sumiu', path: 'workspace/sumiu' }
    ]
  }))
  return ws
}

test('lista os projetos do workspace com contagens, marca o atual e aceita caminho com \\', () => {
  const ws = workspace()
  const got = listProjects(path.join(ws, 'workspace', 'kanban'))
  assert.equal(got.workspace.root, ws)
  assert.equal(got.current.name, 'kanban')
  assert.deepEqual(got.current.stats, { queue: 2, active: 1, done: 0 })
  const by = Object.fromEntries(got.projects.map((p) => [p.name, p]))
  assert.deepEqual(Object.keys(by), ['harness', 'kanban', 'editor', 'sumiu'])
  assert.equal(by.kanban.current, true)
  assert.equal(by.harness.current, false)
  assert.equal(by.kanban.root, path.join(ws, 'workspace', 'kanban'))
  assert.deepEqual(by.harness.stats, { queue: 0, active: 0, done: 3 })
  assert.equal(by.sumiu.exists, false)
  assert.equal(by.sumiu.stats, null)
})

test('fora de workspace: só o projeto atual', () => {
  const dir = tmpdir()
  project(dir, { active: 1 })
  const got = listProjects(dir)
  assert.equal(got.workspace, null)
  assert.deepEqual(got.projects, [])
  assert.equal(got.current.stats.active, 1)
  assert.equal(looksLikeProject(dir), true)
  assert.equal(looksLikeProject(path.join(dir, 'nada')), false)
})

test('desktop: pedido de troca só aceita caminho absoluto de projeto', () => {
  const dir = tmpdir()
  project(dir)
  assert.equal(validProjectRequest(dir), path.resolve(dir))
  assert.equal(validProjectRequest('relativo/x'), null)
  assert.equal(validProjectRequest(path.join(dir, 'tasks')), null)
  assert.equal(validProjectRequest(42), null)
  assert.equal(validProjectRequest(''), null)
  assert.equal(validProjectRequest(dir + '\0x'), null)
})

test('api: GET /api/projects no harness serve', async () => {
  const ws = tmpdir()
  const root = path.join(ws, 'workspace', 'app')
  await withSilentStdout(() => init([root, '--profile', 'script']))
  write(ws, '.harness-workspace.json', JSON.stringify({ version: 1, projectsDir: 'workspace', projects: [{ name: 'app', path: 'workspace/app' }] }))
  const h = await withSilentStdout(async () => {
    const started = buildServe({ root, port: 0 })
    await once(started.server, 'listening')
    return started
  })
  try {
    const port = h.server.address().port
    const body = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/api/projects', headers: { host: `127.0.0.1:${port}` } }, (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(raw) }))
      }).on('error', reject)
    })
    assert.equal(body.status, 200)
    assert.equal(body.json.current.name, 'app')
    assert.deepEqual(body.json.projects.map((p) => [p.name, p.current]), [['app', true]])
  } finally {
    await h.stop()
  }
})
