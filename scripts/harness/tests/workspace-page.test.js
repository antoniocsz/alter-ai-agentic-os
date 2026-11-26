// Workspace do app (feature workspace-app, task 140): página /workspace, mudanças da worktree
// (GET /api/changes) e instruções do humano num run novo (note → prompt + user.message).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import vm from 'node:vm'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildServe } from '../src/serve.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { renderWorkspacePage } from '../src/lib/workspace-page.js'
import { taskChanges, filePatch } from '../src/lib/changes.js'
import { taskWorktree } from '../src/run.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'runtimes', 'fake-chat-agent.js')

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${FAKE}" %*\r\n`)
  } else {
    const file = path.join(dir, 'claude')
    fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    fs.chmodSync(file, 0o755)
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

test('página do workspace: título escapado, config sem fechar o script e JS do cliente compila', () => {
  const html = renderWorkspacePage('Proj <x>', { control: true, token: 'abc</script>', allowUnsafe: false })
  assert.match(html, /<title>Proj &lt;x&gt; — Workspace<\/title>/)
  assert.doesNotMatch(html, /abc<\/script>/)
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="cfg">(.*?)<\/script>/s)[1])
  assert.deepEqual(cfg, { control: true, token: 'abc</script>', allowUnsafe: false })
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(scripts.length, 1)
  assert.doesNotThrow(() => new vm.Script(scripts[0]), 'JS do cliente com erro de sintaxe')
  const ro = JSON.parse(renderWorkspacePage('x').match(/id="cfg">(.*?)<\/script>/s)[1])
  assert.deepEqual(ro, { control: false, token: '', allowUnsafe: false })
})

test('mudanças da task: commits + não commitado + arquivo novo, patch por arquivo', async () => {
  const root = await project('proj-ws-changes')
  const wt = taskWorktree(root, '07-exemplo.md')
  assert.deepEqual(taskChanges(root, wt.dir).files, [])
  const sh = (args) => execFileSync('git', args, { cwd: wt.dir, stdio: 'ignore' })
  fs.appendFileSync(path.join(wt.dir, 'AGENTS.md'), '\nlinha nova\n')
  sh(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'muda agents'])
  write(wt.dir, 'src/a.js', 'export const a = 1\nexport const b = 2\n')
  fs.appendFileSync(path.join(wt.dir, 'harness.json'), '\n')
  const { base, files } = taskChanges(root, wt.dir)
  assert.ok(base)
  const by = Object.fromEntries(files.map((f) => [f.path, f]))
  assert.equal(by['AGENTS.md'].status, 'modified')
  assert.equal(by['AGENTS.md'].added, 2)
  assert.equal(by['src/a.js'].status, 'added')
  assert.equal(by['src/a.js'].added, 2)
  assert.ok(by['harness.json'])
  const novo = filePatch(root, wt.dir, 'src/a.js')
  assert.match(novo.patch, /^@@ -0,0 \+1,2 @@\n\+export const a = 1/)
  const mod = filePatch(root, wt.dir, 'AGENTS.md')
  assert.match(mod.patch, /^@@ /)
  assert.match(mod.patch, /\+linha nova/)
  assert.equal(filePatch(root, wt.dir, '../fora.txt'), null)
})

test('api: /workspace, /api/changes e note num run novo', async () => {
  const root = await project('proj-ws-api')
  const ctl = tmpdir()
  const h = await live(root, { env: fakeEnv({ FAKE_CHAT_DIR: ctl }) })
  const auth = { 'x-harness-token': h.sessionToken }
  try {
    const page = await call(h, 'GET', '/workspace')
    assert.equal(page.status, 200)
    const cfg = JSON.parse(page.raw.match(/id="cfg">(.*?)<\/script>/s)[1])
    assert.equal(cfg.control, true)
    assert.equal(cfg.token, h.sessionToken)

    assert.equal((await call(h, 'GET', '/api/changes')).status, 400)
    let got = await call(h, 'GET', '/api/changes?task=07')
    assert.equal(got.status, 200, got.raw)
    assert.deepEqual(got.json.files, [])

    const rt = await call(h, 'GET', '/api/runtimes')
    assert.equal(rt.json.runtimes.find((r) => r.tool === 'claude').supports_resume, true)
    assert.equal(rt.json.runtimes.find((r) => r.tool === 'gemini').supports_resume, false)

    assert.equal((await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', note: 42 } })).status, 400)
    const run = await call(h, 'POST', '/api/runs', { headers: auth, body: { task: '07', tool: 'claude', contextBudget: 0, note: 'comece pelo teste' } })
    assert.equal(run.status, 202, run.raw)
    await h.runs.settled(run.json.run.id)
    const sent = JSON.parse(fs.readFileSync(path.join(ctl, '1.json'), 'utf8'))
    assert.match(sent.stdin, /--- TASK ---/)
    assert.match(sent.stdin, /--- INSTRUÇÕES DO HUMANO ---\ncomece pelo teste/)
    const conv = await call(h, 'GET', '/api/conversation?task=07')
    assert.equal(conv.json.runs[0].events[0].type, 'user.message')
    assert.equal(conv.json.runs[0].events[0].payload.text, 'comece pelo teste')

    got = await call(h, 'GET', '/api/changes?task=07')
    assert.deepEqual(got.json.files.map((f) => [f.path, f.status]), [['src/a.js', 'added']])
    const one = await call(h, 'GET', '/api/changes?task=07&file=src%2Fa.js')
    assert.equal(one.status, 200, one.raw)
    assert.match(one.json.file.patch, /^@@ -0,0 \+1,1 @@/)
    assert.equal((await call(h, 'GET', '/api/changes?task=07&file=nada.js')).status, 404)
  } finally {
    await h.stop()
  }
})
