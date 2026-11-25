// Qualidade pós-run (feature qualidade-e-analytics, task 128): `harness.json → gates.run` roda na
// worktree depois de cada run concluído (CLI, lote, API, fluxo, competição), sem bloquear o
// processo; resultado em eventos `quality.gate` e na coluna `runs.quality`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { getRun, runEvents } from '../src/lib/runs.js'
import { runTool } from '../src/lib/runner.js'
import { qualityOf, runGatesAsync } from '../src/lib/gates.js'
import { validateConfig } from '../src/lib/config.js'
import { runGatesFor } from '../src/run.js'
import { init } from '../src/init.js'
import { startTask } from '../src/lib/pipeline.js'
import { startWorktree } from '../src/lib/worktree.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'runtimes')
const BIN = path.resolve(HERE, '../bin/harness.js')

function fakeEnv(fake, extra = {}) {
  const dir = tmpdir()
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${fake}" %*\r\n`)
  } else {
    const file = path.join(dir, 'claude')
    fs.writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`)
    fs.chmodSync(file, 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

/** package.json sem dependências: os gates viram `pnpm run <gate>` direto. */
const PKG = JSON.stringify({ name: 'q', private: true, scripts: { lint: 'node -e "process.exit(0)"', test: 'node -e "console.error(\'1 teste falhou\'); process.exit(1)"' } })

test('qualidade: config gates.run, qualityOf, runGatesAsync não bloqueia e roda scripts', async () => {
  assert.deepEqual(validateConfig({ profile: 'bare', gates: { run: ['lint', 'test'] } }), [])
  assert.match(validateConfig({ profile: 'bare', gates: { run: 'lint' } }).join(), /gates\.run deve ser uma lista/)
  assert.equal(qualityOf([]), null)
  assert.equal(qualityOf([{ status: 'passed' }, { status: 'skipped' }]), 'passed')
  assert.equal(qualityOf([{ status: 'passed' }, { status: 'failed' }]), 'failed')
  assert.equal(qualityOf([{ status: 'skipped' }]), 'skipped')

  const dir = tmpdir()
  fs.writeFileSync(path.join(dir, 'package.json'), PKG)
  let ticks = 0
  const timer = setInterval(() => ticks++, 5)
  const results = await runGatesAsync(dir, ['lint', 'test', 'secrets'])
  clearInterval(timer)
  assert.ok(ticks > 0, 'event loop livre enquanto os gates rodam')
  assert.deepEqual(results.map((r) => [r.gate, r.status]), [['lint', 'passed'], ['test', 'failed'], ['secrets', 'passed']])
  assert.match(results[1].output, /1 teste falhou/)

  const root = tmpdir()
  write(root, 'harness.json', JSON.stringify({ profile: 'bare', gates: { run: ['lint'], strict: true } }))
  assert.deepEqual(runGatesFor(root, {}), { list: ['lint'], strict: true })
  assert.equal(runGatesFor(root, { 'no-gates': true }), null)
  write(root, 'harness.json', JSON.stringify({ profile: 'bare' }))
  assert.equal(runGatesFor(root, {}), null)
})

test('qualidade: runTool roda os gates depois do run concluído e grava quality + eventos; run falho não roda', async () => {
  const dir = tmpdir()
  fs.writeFileSync(path.join(dir, 'package.json'), PKG)
  const db = openDb(tmpdir())
  const env = fakeEnv(path.join(FIXTURES, 'fake-claude.js'))
  const ok = await runTool({ db, taskId: '07-x.md', cwd: dir, driver: claude, prompt: 'x', env, gates: { list: ['lint', 'test'], strict: false } })
  assert.equal(ok.status, 'completed')
  assert.equal(ok.quality, 'failed')
  assert.equal(getRun(db, ok.runId).quality, 'failed')
  const gates = runEvents(db, ok.runId).filter((e) => e.type === 'quality.gate').map((e) => [e.payload.gate, e.payload.status])
  assert.deepEqual(gates, [['lint', 'passed'], ['test', 'failed']])
  assert.equal(runEvents(db, ok.runId).at(-1).type, 'quality.gate', 'gates depois do run.completed')

  const failed = await runTool({ db, taskId: '07-x.md', cwd: dir, driver: claude, prompt: 'x', env: fakeEnv(path.join(FIXTURES, 'fake-claude.js'), { FAKE_EXIT: '1' }), gates: { list: ['lint'] } })
  assert.equal(failed.status, 'failed')
  assert.equal(getRun(db, failed.runId).quality, null)
  assert.ok(!runEvents(db, failed.runId).some((e) => e.type === 'quality.gate'))

  const none = await runTool({ db, taskId: '07-x.md', cwd: dir, driver: claude, prompt: 'x', env })
  assert.equal(getRun(db, none.runId).quality, null, 'sem gates.run, nada roda')
  db.close()
})

test('qualidade: harness run e fluxo — gates na worktree; o revisor recebe o resultado', async () => {
  const root = path.join(tmpdir(), 'proj-quality')
  await withSilentStdout(() => init([root, '--profile', 'script', '--git']))
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.json'), 'utf8'))
  cfg.gates = { ...(cfg.gates ?? {}), run: ['test'] }
  write(root, 'harness.json', JSON.stringify(cfg))
  write(root, 'package.json', PKG)
  spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' })
  spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'pkg'], { encoding: 'utf8' })
  write(root, 'tasks/queue/07-exemplo.md', `# Task: exemplo
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Depende de: —
## Critério de conclusão:
- [ ] ok
`)
  assert.equal(startTask(root, '07').ok, true)
  await withSilentStdout(() => startWorktree(root, '07'))

  const run = spawnSync(process.execPath, [BIN, 'run', '07', '--tool', 'claude', '--no-context'], { cwd: root, encoding: 'utf8', env: fakeEnv(path.join(FIXTURES, 'fake-claude.js')) })
  assert.equal(run.status, 0, run.stderr + run.stdout)
  assert.match(run.stdout, /🧪 gate test: ❌ failed/)
  assert.match(run.stdout, /concluído .* · gates failed/)
  const skip = spawnSync(process.execPath, [BIN, 'run', '07', '--tool', 'claude', '--no-context', '--no-gates'], { cwd: root, encoding: 'utf8', env: fakeEnv(path.join(FIXTURES, 'fake-claude.js')) })
  assert.doesNotMatch(skip.stdout, /🧪/)
  assert.match(spawnSync(process.execPath, [BIN, 'runs', '07'], { cwd: root, encoding: 'utf8' }).stdout, /completed · gates failed/)

  const ctl = tmpdir()
  fs.writeFileSync(path.join(ctl, 'verdicts'), 'approved')
  const flow = spawnSync(process.execPath, [BIN, 'flow', '07', '--implement', 'claude', '--review', 'claude', '--no-context'], {
    cwd: root, encoding: 'utf8', env: fakeEnv(path.join(FIXTURES, 'fake-flow-agent.js'), { FAKE_FLOW_DIR: ctl })
  })
  assert.equal(flow.status, 0, flow.stderr + flow.stdout)
  const files = fs.readdirSync(path.join(ctl, 'prompts'))
  const review = fs.readFileSync(path.join(ctl, 'prompts', files.find((f) => f.endsWith('-review.txt'))), 'utf8')
  assert.match(review, /GATES PÓS-RUN DA ÚLTIMA ALTERAÇÃO[\s\S]*resultado: failed[\s\S]*- test: failed/)
  assert.match(review, /1 teste falhou/)
})
