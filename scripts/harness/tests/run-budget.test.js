import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb } from '../src/lib/db.js'
import { startRun, finishRun, getRun, runEvents, listRuns } from '../src/lib/runs.js'
import { runTool } from '../src/lib/runner.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { init } from '../src/init.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')

// Runtime falso (stream-json do Claude): FAKE_STEPS mensagens de API, cada uma emitida em DUAS
// linhas com o mesmo message.id (texto + tool_use), com usage acumulado; depois o result final
// (a menos que seja morto antes). FAKE_DELAY_MS entre mensagens.
const FAKE_SRC = `
if (process.argv.includes('--version')) { process.stdout.write('fake 1.0.0\\\\n'); process.exit(0) }
process.stdin.resume()
process.stdin.on('end', async () => {
  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
  const steps = Number(process.env.FAKE_STEPS ?? 3)
  const per = Number(process.env.FAKE_STEP_TOKENS ?? 100)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  w({ type: 'system', subtype: 'init', session_id: 's', model: 'fake' })
  for (let i = 1; i <= steps; i++) {
    const usage = { input_tokens: per, output_tokens: per }
    w({ type: 'assistant', message: { id: 'msg_' + i, usage, content: [{ type: 'text', text: 'passo ' + i }] } })
    w({ type: 'assistant', message: { id: 'msg_' + i, usage, content: [{ type: 'tool_use', id: 't' + i, name: 'Bash', input: { command: 'ls' } }] } })
    await sleep(Number(process.env.FAKE_DELAY_MS ?? 50))
  }
  w({ type: 'result', subtype: 'success', is_error: false, session_id: 's', total_cost_usd: 0.5, usage: { input_tokens: steps * per, output_tokens: steps * per } })
})
`

function fakeEnv(extra = {}) {
  const dir = tmpdir()
  const script = path.join(dir, 'fake.mjs')
  fs.writeFileSync(script, FAKE_SRC)
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'claude.cmd'), `@"${process.execPath}" "${script}" %*\r\n`)
  } else {
    fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
    fs.chmodSync(path.join(dir, 'claude'), 0o755)
  }
  return { ...process.env, PATH: dir + path.delimiter + (process.env.PATH ?? ''), ...extra }
}

test('claude.create: uso parcial por message.id sem dupla contagem; o result prevalece', () => {
  const d = claude.create()
  const u = (n) => ({ input_tokens: n, output_tokens: n })
  const a = d.normalize({ type: 'assistant', message: { id: 'm1', usage: u(100), content: [{ type: 'text', text: 'x' }] } })
  const b = d.normalize({ type: 'assistant', message: { id: 'm1', usage: u(100), content: [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }] } })
  const c = d.normalize({ type: 'assistant', message: { id: 'm2', usage: { input_tokens: 50, cache_read_input_tokens: 25, output_tokens: 10 }, content: [] } })
  assert.deepEqual(a.meta.partialUsage, { tokensIn: 100, tokensOut: 100, costUsd: null })
  assert.deepEqual(b.meta.partialUsage, { tokensIn: 100, tokensOut: 100, costUsd: null }, 'mesma mensagem não soma de novo')
  assert.deepEqual(c.meta.partialUsage, { tokensIn: 175, tokensOut: 110, costUsd: null })
  const r = d.normalize({ type: 'result', subtype: 'success', is_error: false, usage: u(999), total_cost_usd: 1 })
  assert.deepEqual(r.meta.usage, { tokensIn: 999, tokensOut: 999, costUsd: 1 })
  assert.equal(claude.normalize({ type: 'assistant', message: { id: 'm', usage: u(1), content: [] } }).meta.partialUsage, undefined, 'normalize sem estado continua igual')
})

test('runTool: corta o run quando o uso parcial passa do limite; registra motivo e uso parcial', async () => {
  const root = tmpdir()
  const db = openDb(root)
  const res = await runTool({
    db, taskId: '01-a.md', cwd: root, driver: claude.create(), prompt: 'x',
    env: fakeEnv({ FAKE_STEPS: '20', FAKE_STEP_TOKENS: '100', FAKE_DELAY_MS: '150' }),
    limit: { tokens: 450, usd: null }
  })
  assert.equal(res.status, 'failed')
  assert.match(res.error, /^budget: tokens \d+ > limite 450/)
  const run = getRun(db, res.runId)
  assert.ok(run.tokens_in + run.tokens_out > 450 && run.tokens_in + run.tokens_out <= 800, 'parar logo após passar do limite')
  assert.equal(run.measured, 1, 'uso parcial reportado pela tool é medido')
  const evs = runEvents(db, res.runId)
  assert.ok(evs.some((e) => e.type === 'agent.error' && /orçamento excedido/.test(e.payload.reason)))
  assert.equal(evs.at(-1).type, 'run.failed')
  assert.equal(evs.at(-1).payload.reason, 'budget')

  const ok = await runTool({ db, taskId: '01-a.md', cwd: root, driver: claude.create(), prompt: 'x', env: fakeEnv({ FAKE_STEPS: '2' }), limit: { tokens: 10_000, usd: 5 } })
  assert.equal(ok.status, 'completed')
  assert.deepEqual([getRun(db, ok.runId).tokens_in, getRun(db, ok.runId).cost_usd], [200, 0.5], 'result final prevalece sobre o parcial')
  db.close()
})

const taskMd = (title, scope) => `# Task: ${title}
## Agente: \`backend\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`${scope}\`
## Depende de: —
## Critério de conclusão:
- [ ] ok
`

let root
before(async () => {
  root = path.join(tmpdir(), 'proj-budget')
  await init([root, '--profile', 'script', '--git'])
  for (const [n, scope] of [['01-a', 'src/a.js'], ['02-b', 'src/b.js'], ['03-c', 'src/c.js']]) write(root, `tasks/queue/${n}.md`, taskMd(n, scope))
})

function setBudget(budget) {
  const file = path.join(root, 'harness.json')
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (budget) cfg.budget = budget
  else delete cfg.budget
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2))
}

function seedSpend(taskId, usd) {
  const db = openDb(root)
  const id = startRun(db, { taskId, tool: 'claude' })
  finishRun(db, id, { status: 'completed', exitCode: 0, usage: { tokensIn: 10, tokensOut: 10, costUsd: usd } })
  db.close()
}

const cli = (args, extra = {}) => spawnSync(process.execPath, [BIN, ...args, '--no-context'], { cwd: root, encoding: 'utf8', env: fakeEnv({ FAKE_STEPS: '1', ...extra }) })

test('CLI: recusa prévia por task; --ignore-budget roda e fica gravado; limite do run informado', () => {
  assert.equal(spawnSync(process.execPath, [BIN, 'start', '01'], { cwd: root }).status, 0)
  assert.equal(spawnSync(process.execPath, [BIN, 'worktree', 'start', '01'], { cwd: root }).status, 0)
  setBudget({ task: { usd: 1 }, run: { tokens: 100000 } })
  seedSpend('01-a.md', 2)

  const refused = cli(['run', '01', '--tool', 'claude'])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /orçamento estourado para 01-a\.md:\s+- task: \$2\.00 de \$1\.00[\s\S]*--ignore-budget/)

  const forced = cli(['run', '01', '--tool', 'claude', '--ignore-budget'])
  assert.equal(forced.status, 0, forced.stderr + forced.stdout)
  assert.match(forced.stdout, /--ignore-budget: limites do harness\.json ignorados/)
  const db = openDb(root)
  const [last] = listRuns(db, { taskId: '01-a.md', limit: 1 })
  db.close()
  assert.equal(last.budget_override, 1)

  setBudget({ run: { tokens: 100000 } })
  const limited = cli(['run', '01', '--tool', 'claude'])
  assert.equal(limited.status, 0, limited.stderr)
  assert.match(limited.stdout, /💰 limite deste run: 100000 tokens/)
})

test('CLI lote: task sem orçamento é pulada; dia estourado recusa antes de preparar', () => {
  setBudget({ task: { usd: 1 } })
  seedSpend('02-b.md', 5)
  const batch = cli(['run', '--batch', '02,03', '--tool', 'claude'])
  assert.equal(batch.status, 1, 'pulada conta como não concluída')
  assert.match(batch.stdout, /\[02\] ⏭️ {2}pulada — budget: task: \$5\.00 de \$1\.00/)
  assert.match(batch.stdout, /⏭️ \s*\[02\] 02-b\.md · — · n\/d · budget: /)
  assert.match(batch.stdout, /✅ \[03\] 03-c\.md/)

  setBudget({ day: { usd: 1 } })
  write(root, 'tasks/queue/04-d.md', taskMd('04-d', 'src/d.js'))
  const day = cli(['run', '--batch', '04', '--tool', 'claude'])
  assert.notEqual(day.status, 0)
  assert.match(day.stderr, /lote recusado por orçamento — nada foi preparado nem executado:\s+- dia: \$/)
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'queue', '04-d.md')), 'nada foi preparado')
  setBudget(null)
})
