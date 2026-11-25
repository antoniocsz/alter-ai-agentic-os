// Analytics de execuções (feature qualidade-e-analytics, task 129): agregação por tool, modelo,
// task, agente e dia; só uso REPORTADO entra nas somas; CLI, API e painel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import vm from 'node:vm'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb, syncFromMarkdown } from '../src/lib/db.js'
import { startRun, finishRun } from '../src/lib/runs.js'
import { analytics, parseSince } from '../src/lib/analytics.js'
import { serveBoard, ctxFromRoot } from '../src/kanban.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')

const task = (agent) => `# Task: t
## Agente: \`${agent}\` | Módulo: — | Prioridade: P2 | Tipo: feat
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Critério de conclusão:
- [ ] ok
`

function seed() {
  const root = tmpdir()
  write(root, 'tasks/active/07-a.md', task('backend'))
  write(root, 'tasks/active/08-b.md', task('frontend'))
  const db = openDb(root)
  syncFromMarkdown(db, root)
  const run = (taskId, tool, model, status, usage, quality = null, startedAt = null) => {
    const id = startRun(db, { taskId, tool, model })
    finishRun(db, id, { status, exitCode: status === 'completed' ? 0 : 1, usage })
    db.prepare('UPDATE runs SET quality = ?, started_at = COALESCE(?, started_at) WHERE id = ?').run(quality, startedAt, id)
    return id
  }
  run('07-a.md', 'claude', 'sonnet', 'completed', { tokensIn: 1000, tokensOut: 200, costUsd: 0.5 }, 'passed')
  run('07-a.md', 'claude', 'opus', 'failed', { tokensIn: 500, tokensOut: 50, costUsd: 0.25 })
  run('08-b.md', 'codex', null, 'completed', { tokensIn: 3000, tokensOut: 300, costUsd: null }, 'failed')
  run('08-b.md', 'opencode', null, 'completed', null) // sem uso reportado
  run('07-a.md', 'claude', 'sonnet', 'completed', { tokensIn: 9999, tokensOut: 1, costUsd: 9 }, null, '2020-01-01T00:00:00.000Z') // fora do período
  return { root, db }
}

test('analytics: agrupa por tool/modelo/task/agente/dia, só soma uso reportado, filtra período', () => {
  const { db } = seed()
  const since = parseSince('30d')
  const byTool = analytics(db, { by: 'tool', since })
  assert.equal(byTool.totals.runs, 4)
  assert.equal(byTool.totals.unmeasured, 1)
  assert.equal(byTool.totals.tokens_in, 4500)
  assert.equal(byTool.totals.cost_usd, 0.75)
  assert.equal(byTool.totals.success_rate, 0.75)
  assert.equal(byTool.totals.quality_rate, 0.5)
  const claude = byTool.groups.find((g) => g.key === 'claude')
  assert.deepEqual([claude.runs, claude.completed, claude.failed, claude.success_rate, claude.cost_usd, claude.tokens_out], [2, 1, 1, 0.5, 0.75, 250])
  assert.equal(byTool.groups[0].key, 'claude', 'ordenado por custo')
  assert.equal(byTool.groups.find((g) => g.key === 'opencode').unmeasured, 1)

  assert.deepEqual(analytics(db, { by: 'agent', since }).groups.map((g) => [g.key, g.runs]).sort(), [['backend', 2], ['frontend', 2]])
  assert.deepEqual(analytics(db, { by: 'model', since }).groups.map((g) => g.key).sort(), ['n/d', 'opus', 'sonnet'])
  assert.deepEqual(analytics(db, { by: 'task', since }).groups.map((g) => g.key).sort(), ['07-a.md', '08-b.md'])
  assert.equal(analytics(db, { by: 'day', since }).groups.length, 1)
  assert.equal(analytics(db, { by: 'tool' }).totals.runs, 5, 'sem período: tudo')
  assert.throws(() => analytics(db, { by: 'cor' }), /--by inválido/)
  assert.throws(() => parseSince('ontem'), /--since inválido/)
  assert.equal(parseSince('all'), null)
  assert.equal(parseSince('2026-11-01'), '2026-11-01T00:00:00.000Z')
  db.close()
})

test('harness analytics (CLI) e painel /analytics + /api/analytics', async () => {
  const { root, db } = seed()
  db.close()
  const res = spawnSync(process.execPath, [BIN, 'analytics', '--by', 'agent'], { cwd: root, encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /4 run\(s\) · sucesso 75% · tokens 4\.500\/550 · custo \$0\.7500 · gates 50% · 1 sem uso reportado/)
  assert.match(res.stdout, /backend +2 +50%/)
  const json = JSON.parse(spawnSync(process.execPath, [BIN, 'analytics', '--json', '--since', 'all'], { cwd: root, encoding: 'utf8' }).stdout)
  assert.equal(json.totals.runs, 5)
  assert.notEqual(spawnSync(process.execPath, [BIN, 'analytics', '--by', 'x'], { cwd: root, encoding: 'utf8' }).status, 0)

  const server = await withSilentStdout(async () => {
    const srv = serveBoard(ctxFromRoot(root), 0, '127.0.0.1')
    await once(srv, 'listening')
    return srv
  })
  const get = (p) =>
    new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (r) => {
        let raw = ''
        r.setEncoding('utf8')
        r.on('data', (c) => (raw += c))
        r.on('end', () => resolve({ status: r.statusCode, raw }))
      }).on('error', reject)
    })
  try {
    const page = await get('/analytics')
    assert.equal(page.status, 200)
    assert.match(page.raw, /Custo \(USD reportado\)/)
    assert.doesNotThrow(() => new vm.Script(page.raw.match(/<script>([\s\S]*)<\/script>/)[1]))
    const api = JSON.parse((await get('/api/analytics?by=tool&since=30d')).raw)
    assert.equal(api.ok, true)
    assert.equal(api.totals.runs, 4)
    assert.equal((await get('/api/analytics?by=x')).status, 400)
    assert.match((await get('/canvas')).raw, /href="\/analytics"/)
  } finally {
    await new Promise((r) => server.close(r))
  }
})
