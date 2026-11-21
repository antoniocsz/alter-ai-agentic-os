import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { once } from 'node:events'
import { openDb, syncFromMarkdown } from '../src/lib/db.js'
import { startRun, appendRunEvent, finishRun } from '../src/lib/runs.js'
import { canvasState, summarizeAgentEvent, STALE_MS } from '../src/lib/canvas.js'
import { renderCanvasPage, serveBoard } from '../src/kanban.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Escopo:
- \`src/foo.js\`
## Critério de conclusão:
- [ ] ok
`
const ID = '01-foo.md'

function project() {
  const root = tmpdir()
  write(root, `tasks/active/${ID}`, TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  return { root, db }
}

const cardOf = (root) => canvasState({ projects: [{ name: 'A', root }] }).canvas[0]

/** Executa o <script> da página /canvas num vm com DOM falso e devolve o contexto. */
function canvasScript() {
  const html = renderCanvasPage('t')
  const code = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, textContent: '', innerHTML: '', dataset: {} })
  const ctx = {
    document: { getElementById: el, querySelectorAll: () => [], addEventListener() {} },
    fetch: () => new Promise(() => {}),
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    Date,
    Number,
    String,
    Math,
    isNaN
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  return ctx
}

test('canvasState: sem run o cartão mantém o formato atual (run: null)', () => {
  const { root, db } = project()
  db.close()
  const c = cardOf(root)
  assert.equal(c.id, ID)
  assert.equal(c.run, null)
  assert.equal(c.stale, false)
})

test('canvasState: run em curso expõe tool, status e último evento do agente; tokens n/d', () => {
  const { root, db } = project()
  const runId = startRun(db, { taskId: ID, tool: 'claude', model: 'opus', pid: process.pid })
  appendRunEvent(db, runId, { type: 'run.started', payload: { session_id: 's' } })
  appendRunEvent(db, runId, { type: 'agent.tool_call', payload: { name: 'Bash', input: { command: 'node --test' } } })
  appendRunEvent(db, runId, { type: 'agent.usage', payload: { output_tokens: 1 } }) // não conta como "último evento do agente"
  db.close()

  const { run } = cardOf(root)
  assert.equal(run.id, runId)
  assert.equal(run.tool, 'claude')
  assert.equal(run.model, 'opus')
  assert.equal(run.status, 'running')
  assert.deepEqual(
    { type: run.last_agent_event.type, summary: run.last_agent_event.summary },
    { type: 'agent.tool_call', summary: 'Bash node --test' }
  )
  assert.equal(run.tokens_in, null)
  assert.equal(run.cost_usd, null)
  assert.equal(run.measured, false)
})

test('canvasState: run concluído traz uso medido; o mais recente da task prevalece', () => {
  const { root, db } = project()
  const old = startRun(db, { taskId: ID, tool: 'codex', id: 'run-01-20260101000000000' })
  finishRun(db, old, { status: 'failed', exitCode: 1 })
  db.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', old)
  const runId = startRun(db, { taskId: ID, tool: 'claude', unsafe: true })
  appendRunEvent(db, runId, { type: 'agent.file_changed', payload: { path: 'src/foo.js', tool: 'Edit' } })
  finishRun(db, runId, { status: 'completed', exitCode: 0, usage: { tokensIn: 1500, tokensOut: 450, costUsd: 0.0421 } })
  db.close()

  const { run } = cardOf(root)
  assert.equal(run.id, runId)
  assert.equal(run.status, 'completed')
  assert.equal(run.unsafe, true)
  assert.equal(run.last_agent_event.summary, 'alterou src/foo.js')
  assert.deepEqual([run.tokens_in, run.tokens_out, run.cost_usd, run.measured], [1500, 450, 0.0421, true])
})

test('staleness considera run_events: evento recente do agente mantém o cartão ativo', () => {
  const { root, db } = project()
  const old = new Date(Date.now() - STALE_MS - 60_000).toISOString()
  db.prepare('UPDATE task_events SET at = ? WHERE task_id = ?').run(old, ID)
  db.prepare('UPDATE tasks SET started_at = ? WHERE id = ?').run(old, ID)
  db.close()
  assert.equal(cardOf(root).stale, true, 'sem run: stale')

  const db2 = openDb(root)
  const runId = startRun(db2, { taskId: ID, tool: 'claude', pid: process.pid })
  db2.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run(old, runId)
  appendRunEvent(db2, runId, { type: 'agent.message', payload: { text: 'ainda trabalhando' } })
  db2.close()
  // A única atividade recente é o run_event — é ela que define last_activity_at.
  const card = cardOf(root)
  assert.equal(card.stale, false)
  assert.equal(card.last_activity_at, card.run.last_agent_event.at)
})

test('summarizeAgentEvent: resumos curtos por tipo', () => {
  assert.equal(summarizeAgentEvent('agent.message', { text: 'a\n  b' }), 'a b')
  assert.equal(summarizeAgentEvent('agent.tool_call', { name: 'Edit', input: { file_path: 'x.js' } }), 'Edit x.js')
  assert.equal(summarizeAgentEvent('agent.tool_result', { is_error: true, text: 'boom' }), 'erro de ferramenta: boom')
  assert.equal(summarizeAgentEvent('agent.error', { reason: 'max turns' }), 'erro: max turns')
  assert.equal(summarizeAgentEvent('agent.message', 'texto puro'), 'texto puro')
  assert.equal(summarizeAgentEvent('agent.message', { text: 'x'.repeat(300) }).length, 141)
})

test('/canvas: cartão renderiza a linha do run (tool, status, último evento, tokens/custo) e escapa HTML', () => {
  const ui = canvasScript()
  const base = { id: ID, title: 'Foo', agent: 'backend', worktree: 'raiz', running_ms: 1000, changed_files: 0, stale: false }

  const without = ui.cardHtml({ ...base, run: null })
  assert.ok(!without.includes('class="run"'), 'sem run, sem bloco de run')

  const html = ui.cardHtml({
    ...base,
    run: {
      id: 'run-01-x', tool: 'claude', model: 'opus', status: 'completed', unsafe: false,
      last_agent_event: { type: 'agent.message', summary: '<b>pronto</b>', at: new Date().toISOString() },
      tokens_in: 1500, tokens_out: 450, cost_usd: 0.0421, measured: true
    }
  })
  assert.match(html, /🤖 claude · opus/)
  assert.match(html, /run-status completed">✔ concluído/)
  assert.match(html, /&lt;b&gt;pronto&lt;\/b&gt;/)
  assert.ok(!html.includes('<b>pronto</b>'))
  assert.match(html, /1500 \/ 450 · \$0\.0421 \(medido\)/)

  const running = ui.cardHtml({
    ...base,
    run: { id: 'r2', tool: 'claude', model: null, status: 'running', unsafe: true, last_agent_event: null, tokens_in: null, tokens_out: null, cost_usd: null, measured: false }
  })
  assert.match(running, /⚠️ unsafe/)
  assert.match(running, /▶ rodando/)
  assert.match(running, /n\/d · n\/d/)
})

test('GET /api/canvas inclui o run do cartão', async () => {
  await withSilentStdout(async () => {
    const { root, db } = project()
    const runId = startRun(db, { taskId: ID, tool: 'claude', pid: process.pid })
    appendRunEvent(db, runId, { type: 'agent.message', payload: { text: 'lendo' } })
    db.close()
    const server = serveBoard({ projects: [{ name: 'A', root }], title: 't' }, 0)
    await once(server, 'listening')
    try {
      const body = await (await fetch(`http://localhost:${server.address().port}/api/canvas`)).json()
      assert.equal(body.canvas[0].run.id, runId)
      assert.equal(body.canvas[0].run.last_agent_event.summary, 'lendo')
    } finally {
      server.close()
    }
  })
})
