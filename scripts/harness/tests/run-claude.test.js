import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { getRun, listRuns, runEvents, pidAlive } from '../src/lib/runs.js'
import { runTool, stopRun, resolveExecutable, assertSafeArgs } from '../src/lib/runner.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'runtimes')
const FAKE = path.join(FIXTURES, 'fake-claude.js')
const BIN = path.resolve(HERE, '../bin/harness.js')
const TASK = '07-exemplo.md'

/** Diretório com um `claude` falso (sh no POSIX, .cmd no Windows) apontando p/ fake-claude.js. */
function fakeBinDir() {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${FAKE}" %*\r\n`)
  } else {
    const file = path.join(dir, 'claude')
    fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    fs.chmodSync(file, 0o755)
  }
  return dir
}

function envWith(extra = {}) {
  const bin = fakeBinDir()
  return { ...process.env, PATH: bin + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

const fixture = (name) => path.join(FIXTURES, name)

test('claude.normalize: transcrição stream-json → eventos normalizados + meta', () => {
  const lines = fs.readFileSync(fixture('claude-success.jsonl'), 'utf8').split('\n').filter(Boolean)
  const types = []
  let meta = {}
  for (const l of lines) {
    let obj
    try {
      obj = JSON.parse(l)
    } catch {
      continue // o runner trata linha não-JSON; aqui só o driver
    }
    const out = claude.normalize(obj)
    meta = { ...meta, ...out.meta }
    types.push(...out.events.map((e) => e.type))
  }
  assert.deepEqual(types, [
    'run.started',
    'agent.message',
    'agent.tool_call',
    'agent.file_changed',
    'agent.tool_result',
    'agent.tool_call',
    'agent.tool_result',
    'agent.message', // tipo desconhecido preservado
    'agent.usage',
    'agent.message' // resultado final
  ])
  assert.equal(meta.sessionId, 'sess-fake-1')
  assert.deepEqual(meta.usage, { tokensIn: 1500, tokensOut: 450, costUsd: 0.0421 })
  assert.deepEqual(meta.final, { ok: true, reason: null })

  const unknown = claude.normalize({ type: 'stream_desconhecido', foo: 1 })
  assert.deepEqual(unknown.events[0].native, { type: 'stream_desconhecido', foo: 1 })
})

test('claude.command: acceptEdits por padrão, bypass só com unsafe, modo inválido rejeitado', () => {
  assert.deepEqual(claude.command(), ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'])
  assert.deepEqual(claude.command({ model: 'opus', permissionMode: 'plan' }).slice(-4), ['--model', 'opus', '--permission-mode', 'plan'])
  assert.deepEqual(claude.command({ unsafe: true }).slice(-2), ['--permission-mode', 'bypassPermissions'])
  assert.throws(() => claude.command({ permissionMode: 'bypassPermissions' }), /bypass só com --unsafe/)
  assert.throws(() => assertSafeArgs(['-p', 'faça algo & del *']), /argumento inseguro/)
})

test('resolveExecutable: acha no PATH, respeita PATHEXT no Windows (.cmd → shell) e retorna null se ausente', () => {
  const posixDir = tmpdir()
  const exe = path.join(posixDir, 'tool-x')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  if (process.platform !== 'win32') {
    assert.equal(resolveExecutable('tool-x', { env: { PATH: posixDir } }).file, exe)
  }
  const winDir = tmpdir()
  fs.writeFileSync(path.join(winDir, 'tool-y.cmd'), '@echo off\r\n')
  const win = resolveExecutable('tool-y', { env: { PATH: winDir, PATHEXT: '.EXE;.CMD' }, platform: 'win32' })
  assert.equal(win.shell, true)
  assert.match(win.file, /tool-y\.cmd$/)
  assert.equal(resolveExecutable('nao-existe-xyz', { env: { PATH: winDir } }), null)
})

test('runTool: executa de verdade, prompt via stdin, cwd = worktree, eventos e usage medido gravados', async () => {
  const root = tmpdir()
  const cwd = path.join(root, 'wt')
  fs.mkdirSync(cwd)
  const log = path.join(root, 'fake.log')
  const db = openDb(root)
  const seen = []
  const res = await runTool({
    db,
    taskId: TASK,
    cwd,
    driver: claude,
    prompt: 'PROMPT DA TASK 07',
    opts: { model: 'opus' },
    env: envWith({ FAKE_LOG: log }),
    onEvent: (ev) => seen.push(ev.type)
  })
  assert.equal(res.status, 'completed')
  assert.equal(res.exitCode, 0)

  const called = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(called.stdin, 'PROMPT DA TASK 07')
  assert.deepEqual(called.argv.slice(0, 4), ['-p', '--output-format', 'stream-json', '--verbose'])
  assert.equal(fs.realpathSync(called.cwd), fs.realpathSync(cwd))

  const run = getRun(db, res.runId)
  assert.equal(run.status, 'completed')
  assert.equal(run.session_id, 'sess-fake-1')
  assert.equal(run.model, 'claude-opus-test', 'modelo reportado pelo runtime prevalece')
  assert.equal(run.tokens_in, 1500)
  assert.equal(run.tokens_out, 450)
  assert.equal(run.cost_usd, 0.0421)
  assert.equal(run.measured, 1)
  assert.ok(Number.isInteger(run.pid))

  const events = runEvents(db, res.runId)
  const raw = events.find((e) => e.native === 'linha de log que não é JSON')
  assert.ok(raw, 'linha não-JSON preservada como agent.message com native bruto')
  assert.equal(raw.type, 'agent.message')
  assert.equal(events.at(-1).type, 'run.completed')
  assert.ok(events.some((e) => e.type === 'agent.file_changed' && e.payload.path === 'src/a.js'))
  assert.equal(seen.length, events.length, 'onEvent recebe todos os eventos')
  db.close()
})

test('runTool: exit ≠ 0 e resultado is_error viram run failed com motivo; sem usage → n/d', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const crashed = await runTool({
    db, taskId: TASK, cwd: root, driver: claude, prompt: 'x',
    env: envWith({ FAKE_EXIT: '3', FAKE_STDERR: 'auth expirada', FAKE_TRANSCRIPT: fixture('claude-no-usage.jsonl') })
  })
  assert.equal(crashed.status, 'failed')
  assert.equal(crashed.exitCode, 3)
  assert.match(getRun(db, crashed.runId).error, /auth expirada/)

  const errored = await runTool({ db, taskId: TASK, cwd: root, driver: claude, prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: fixture('claude-error.jsonl') }) })
  assert.equal(errored.status, 'failed')
  assert.match(getRun(db, errored.runId).error, /error_max_turns/)
  assert.equal(getRun(db, errored.runId).tokens_in, 50, 'usage reportado mesmo em erro')

  const noUsage = await runTool({ db, taskId: TASK, cwd: root, driver: claude, prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: fixture('claude-no-usage.jsonl') }) })
  const run = getRun(db, noUsage.runId)
  assert.equal(run.status, 'completed')
  assert.equal(run.tokens_in, null)
  assert.equal(run.cost_usd, null)
  assert.equal(run.measured, 0)
  db.close()
})

test('runTool: AbortSignal mata o processo e registra run.failed (interrupted)', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const controller = new AbortController()
  const log = path.join(root, 'hang.log')
  const res = await runTool({
    db, taskId: TASK, cwd: root, driver: claude, prompt: 'x',
    env: envWith({ FAKE_HANG: '1', FAKE_LOG: log }),
    signal: controller.signal,
    onEvent: () => controller.abort()
  })
  assert.equal(res.status, 'failed')
  assert.equal(res.error, 'interrupted')
  const events = runEvents(db, res.runId)
  assert.equal(events.at(-1).type, 'run.failed')
  assert.equal(events.at(-1).payload.reason, 'interrupted')
  const { pid } = JSON.parse(fs.readFileSync(log, 'utf8'))
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(pidAlive(pid), false, 'a árvore do processo foi encerrada')
  db.close()
})

test('stopRun: interrompe run de outro processo sem o dono sobrescrever o status', async () => {
  const root = tmpdir()
  const db = openDb(root)
  let runId = null
  const res = await runTool({
    db, taskId: TASK, cwd: root, driver: claude, prompt: 'x',
    env: envWith({ FAKE_HANG: '1' }),
    onEvent: (ev) => {
      if (runId) return
      runId = ev.runId
      assert.equal(stopRun(db, runId).ok, true)
    }
  })
  assert.equal(res.status, 'failed')
  const run = getRun(db, res.runId)
  assert.equal(run.error, 'interrupted')
  const failed = runEvents(db, res.runId).filter((e) => e.type === 'run.failed')
  assert.equal(failed.length, 1, 'um único run.failed (o do stop)')
  assert.equal(failed[0].payload.by, 'stop')
  assert.equal(stopRun(db, res.runId).ok, false)
  db.close()
})

test('runTool: tool ausente no PATH falha antes de abrir run (nada simulado)', () => {
  const root = tmpdir()
  const db = openDb(root)
  const empty = tmpdir()
  assert.throws(
    () => runTool({ db, taskId: TASK, cwd: root, driver: claude, prompt: 'x', env: { ...process.env, PATH: empty, Path: empty } }),
    /claude não encontrado no PATH[\s\S]*npm install -g @anthropic-ai\/claude-code/
  )
  assert.equal(listRuns(db).length, 0)
  db.close()
})

test('harness run (CLI): recusa task não ativa e task sem worktree; executa na worktree da task', async () => {
  const root = path.join(tmpdir(), 'proj-run')
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
  const cli = (args, env = envWith()) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8', env })

  const notActive = cli(['run', '07', '--tool', 'claude'])
  assert.notEqual(notActive.status, 0)
  assert.match(notActive.stderr, /task não está ativa/)

  assert.equal(startTask(root, '07').ok, true)
  const noWt = cli(['run', '07', '--tool', 'claude'])
  assert.notEqual(noWt.status, 0)
  assert.match(noWt.stderr, /task sem worktree/)

  const wt = startWorktree(root, '07')
  const log = path.join(tmpdir(), 'cli-fake.log')
  const ok = cli(['run', '07', '--tool', 'claude'], envWith({ FAKE_LOG: log }))
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.match(ok.stdout, /▶️ {2}run-07-/)
  assert.match(ok.stdout, /📝 src\/a\.js/)
  assert.match(ok.stdout, /✅ run-07-\S+ concluído · tokens 1500\/450 · custo \$0\.0421 \(medido\)/)

  const called = JSON.parse(fs.readFileSync(log, 'utf8'))
  assert.equal(fs.realpathSync(called.cwd), fs.realpathSync(wt.dir), 'roda dentro da worktree da task')
  assert.match(called.stdin, /--- TASK ---[\s\S]*# Task: exemplo/)
  assert.match(called.stdin, /NÃO rode `harness finish`/)

  const runs = JSON.parse(cli(['runs', '07', '--json']).stdout)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'completed')
  assert.equal(runs[0].usage, 'medido')

  const failing = cli(['run', '07', '--tool', 'claude'], envWith({ FAKE_TRANSCRIPT: fixture('claude-error.jsonl') }))
  assert.equal(failing.status, 1)
  assert.match(failing.stdout, /❌ run-07-\S+ falhou: claude: error_max_turns/)
})
