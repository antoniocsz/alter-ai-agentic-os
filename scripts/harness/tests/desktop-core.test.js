// App desktop (feature app-desktop, task 135): núcleo sem Electron (apps/desktop/src/core.js) e o
// encerramento gracioso do serve por POST /api/shutdown.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  harnessEntry,
  isHarnessProject,
  isInternalUrl,
  loadSettings,
  nodeCommand,
  readServeFile,
  ringLog,
  saveSettings,
  serveArgs,
  startServe,
  stopServe,
  touchRecent,
  MAX_RECENTS
} from '../../../apps/desktop/src/core.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '../bin/harness.js')

function get(url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (raw += c))
      res.on('end', () => resolve({ status: res.statusCode, raw }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('desktop core: caminhos, comando Node, projeto, args, serve.json, navegação, log', () => {
  assert.equal(harnessEntry({ appDir: '/r/apps/desktop', env: {} }), path.resolve('/r/scripts/harness/bin/harness.js'))
  assert.equal(harnessEntry({ packaged: true, resourcesPath: '/app/resources', env: {} }), path.join('/app/resources', 'harness', 'scripts', 'harness', 'bin', 'harness.js'))
  assert.equal(harnessEntry({ env: { HARNESS_BIN: '/x/harness.js' } }), path.resolve('/x/harness.js'))
  assert.deepEqual(nodeCommand({ execPath: '/app/electron', env: { A: '1' } }), { cmd: '/app/electron', env: { A: '1', ELECTRON_RUN_AS_NODE: '1' } })
  assert.equal(nodeCommand({ execPath: '/app/electron', env: { HARNESS_NODE: '/usr/bin/node' } }).cmd, '/usr/bin/node')

  const proj = tmpdir()
  assert.equal(isHarnessProject(proj), false)
  write(proj, 'harness.json', '{}')
  assert.equal(isHarnessProject(proj), true)
  assert.equal(isHarnessProject(path.join(proj, 'harness.json')), false, 'arquivo não é pasta')
  assert.equal(isHarnessProject(null), false)

  assert.deepEqual(serveArgs('h.js'), ['h.js', 'serve', '--port', '0', '--host', '127.0.0.1'])
  assert.equal(serveArgs('h.js', { allowUnsafe: true }).at(-1), '--allow-unsafe')

  write(proj, '.harness/serve.json', JSON.stringify({ url: 'http://127.0.0.1:5000', pid: 42, token: 't' }))
  assert.equal(readServeFile(proj, 42).url, 'http://127.0.0.1:5000')
  assert.equal(readServeFile(proj, 43), null, 'serve de outro processo')
  write(proj, '.harness/serve.json', JSON.stringify({ url: 'http://evil.example:80', pid: 42, token: 't' }))
  assert.equal(readServeFile(proj, 42), null, 'só loopback')

  assert.equal(isInternalUrl('http://127.0.0.1:5000/canvas', 'http://127.0.0.1:5000'), true)
  assert.equal(isInternalUrl('http://127.0.0.1:5001/canvas', 'http://127.0.0.1:5000'), false)
  assert.equal(isInternalUrl('https://github.com', 'http://127.0.0.1:5000'), false)
  assert.equal(isInternalUrl('nada', 'http://127.0.0.1:5000'), false)

  const log = ringLog(3)
  log.push('a\nb\n')
  log.push('c\nd')
  assert.deepEqual(log.lines(), ['b', 'c', 'd'])
})

test('desktop core: configurações e projetos recentes', () => {
  const file = path.join(tmpdir(), 'cfg', 'settings.json')
  assert.deepEqual(loadSettings(file), { recents: [], unsafe: {}, window: null })
  let s = loadSettings(file)
  for (let i = 0; i < MAX_RECENTS + 2; i++) s = touchRecent(s, `/p/${i}`)
  s = touchRecent(s, '/p/3')
  assert.equal(s.recents.length, MAX_RECENTS)
  assert.equal(s.recents[0], path.resolve('/p/3'))
  assert.equal(s.recents.filter((p) => p === path.resolve('/p/3')).length, 1)
  saveSettings(file, { ...s, unsafe: { '/p/3': true }, window: { width: 1000, height: 700 } })
  const back = loadSettings(file)
  assert.deepEqual(back.unsafe, { '/p/3': true })
  assert.deepEqual(back.window, { width: 1000, height: 700 })
  fs.writeFileSync(file, '{quebrado')
  assert.deepEqual(loadSettings(file).recents, [])
})

test('desktop core: startServe sobe o harness serve real, painel responde, stopServe encerra por /api/shutdown', async () => {
  const root = tmpdir()
  write(root, 'harness.json', JSON.stringify({ profile: 'bare' }))
  await assert.rejects(startServe({ root: tmpdir(), entry: BIN, execPath: process.execPath }), /não é um projeto do harness/)
  await assert.rejects(startServe({ root, entry: '/nao/existe.js', execPath: process.execPath }), /CLI do harness não encontrado/)

  const env = { ...process.env, HARNESS_NODE: process.execPath }
  const started = await startServe({ root, entry: BIN, execPath: process.execPath, env, timeoutMs: 30_000 })
  const { info, child } = started
  assert.match(info.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(info.pid, child.pid)
  assert.equal((await get(new URL('/canvas', info.url).href)).status, 200)
  assert.equal((await get(new URL('/analytics', info.url).href)).status, 200)
  assert.equal((await get(new URL('/api/shutdown', info.url).href, {}, 'POST')).status, 401, 'shutdown exige o token')
  assert.match(started.log.text(), /harness serve/)

  const exited = new Promise((r) => child.once('exit', (code) => r(code)))
  await stopServe(started, { timeoutMs: 15_000 })
  assert.equal(await exited, 0, 'encerramento gracioso (exit 0), não kill')
  assert.equal(fs.existsSync(path.join(root, '.harness', 'serve.json')), false, 'serve.json removido')
})

test('desktop: main.js do Electron compila e o package.json declara o empacotamento do CLI', async () => {
  const { spawnSync } = await import('node:child_process')
  const main = path.resolve(HERE, '../../../apps/desktop/src/main.js')
  const res = spawnSync(process.execPath, ['--check', main], { encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '../../../apps/desktop/package.json'), 'utf8'))
  assert.equal(pkg.main, 'src/main.js')
  assert.ok(pkg.devDependencies.electron && pkg.devDependencies['electron-builder'])
  assert.equal(pkg.build.extraResources[0].to, 'harness/scripts/harness')
  assert.ok(pkg.build.extraResources[0].filter.includes('!tests/**'))
})
