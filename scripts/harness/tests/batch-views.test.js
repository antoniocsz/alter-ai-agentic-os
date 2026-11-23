import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb, syncFromMarkdown } from '../src/lib/db.js'
import { startRun, finishRun } from '../src/lib/runs.js'
import { canvasState } from '../src/lib/canvas.js'
import { renderCanvasPage } from '../src/kanban.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')
const cli = (root, args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })
const TASK = '# Task: x\n## Agente: `backend`\n## Escopo:\n- `src/x.js`\n## Critério de conclusão:\n- [ ] ok\n'

function seed() {
  const root = tmpdir()
  write(root, 'tasks/active/01-a.md', TASK)
  write(root, 'tasks/active/02-b.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  const b1 = 'batch-20261123000000001'
  const r1 = startRun(db, { taskId: '01-a.md', tool: 'claude', batchId: b1, pid: process.pid })
  const r2 = startRun(db, { taskId: '02-b.md', tool: 'claude', batchId: b1, pid: process.pid })
  const solo = startRun(db, { taskId: '01-a.md', tool: 'codex', pid: process.pid })
  for (const id of [r1, r2]) finishRun(db, id, { status: 'completed', exitCode: 0 })
  finishRun(db, solo, { status: 'completed', exitCode: 0 })
  db.close()
  return { root, b1, r1, r2, solo }
}

test('harness runs --batch <id>: filtra o lote (json e tabela com coluna lote)', () => {
  const { root, b1, r1, r2, solo } = seed()
  const json = cli(root, ['runs', '--batch', b1, '--json'])
  assert.equal(json.status, 0, json.stderr)
  const rows = JSON.parse(json.stdout)
  assert.deepEqual(rows.map((r) => r.id).sort(), [r1, r2].sort())
  assert.ok(rows.every((r) => r.batch_id === b1))

  const both = cli(root, ['runs', '01', '--batch', b1, '--json'])
  assert.deepEqual(JSON.parse(both.stdout).map((r) => r.id), [r1], 'task + lote')

  const all = JSON.parse(cli(root, ['runs', '--json']).stdout)
  assert.equal(all.find((r) => r.id === solo).batch_id, null)

  const table = cli(root, ['runs', '--batch', b1])
  assert.match(table.stdout, /^run\s+lote\s+task/m)
  assert.match(table.stdout, new RegExp(b1))

  const none = cli(root, ['runs', '--batch', 'batch-inexistente'])
  assert.match(none.stdout, /nenhuma execução registrada no lote batch-inexistente/)
  assert.notEqual(cli(root, ['runs', '--batch']).status, 0)
})

test('canvas: run do cartão expõe batch_id (null fora de lote)', () => {
  const { root, b1 } = seed()
  const cards = canvasState({ projects: [{ name: 'A', root }] }).canvas
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]))
  assert.equal(byId['02-b.md'].run.batch_id, b1)
  assert.equal(byId['01-a.md'].run.batch_id, null, 'run mais recente de 01 foi o avulso')
})

test('/canvas: cardHtml mostra o lote só quando o run tem batch_id', () => {
  const html = renderCanvasPage('t')
  const code = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, textContent: '', innerHTML: '', dataset: {} })
  const ctx = { document: { getElementById: el, querySelectorAll: () => [], addEventListener() {} }, fetch: () => new Promise(() => {}), setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {}, Date, Number, String, Math, isNaN }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  const base = { id: '01-a.md', title: 'x', agent: 'backend', worktree: 'raiz', running_ms: 1, changed_files: 0, stale: false }
  const run = { id: 'r', tool: 'claude', model: null, status: 'running', unsafe: false, last_agent_event: null, tokens_in: null, tokens_out: null, cost_usd: null, measured: false }
  assert.match(ctx.cardHtml({ ...base, run: { ...run, batch_id: 'batch-1<x>' } }), /🧩 lote<\/span><span class="val" title="harness runs --batch batch-1&lt;x&gt;">batch-1&lt;x&gt;/)
  assert.ok(!ctx.cardHtml({ ...base, run: { ...run, batch_id: null } }).includes('🧩'))
})
