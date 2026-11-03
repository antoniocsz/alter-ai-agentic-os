import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { sessionEnd, listSessions, recall, statusReport } from '../src/lib/memory.js'
import { tmpdir, write } from './helpers.js'

async function makeProject() {
  const root = path.join(tmpdir(), 'memoria-projeto')
  await init([root, '--profile', 'script'])
  return root
}

test('session end grava markdown + banco e list recupera', async () => {
  const root = await makeProject()
  const res = sessionEnd(root, 'implementei o webhook do billing')

  assert.ok(fs.existsSync(path.join(root, res.file)), 'arquivo da sessão não criado')
  assert.match(fs.readFileSync(path.join(root, res.file), 'utf8'), /webhook do billing/)

  const rows = listSessions(root)
  assert.equal(rows.length, 1)
  assert.match(rows[0].summary, /webhook/)
})

test('recall encontra sessão, task e doc', async () => {
  const root = await makeProject()
  sessionEnd(root, 'ajustei o webhook do billing')
  write(
    root,
    'tasks/queue/01-webhook.md',
    '# Task: Criar webhook\n## Agente: `backend`\n## Escopo:\n- `src/webhook.js`\n## Critério de conclusão:\n- [ ] ok\n'
  )
  write(root, 'context/project/overview.md', '# Overview\n\nProcessa webhook do provedor.\n')

  const hits = recall(root, 'webhook')
  assert.ok(hits.some((h) => h.kind === 'session'), 'deveria achar sessão')
  assert.ok(hits.some((h) => h.kind === 'doc' && h.source.includes('overview.md')), 'deveria achar doc')
  assert.ok(hits.some((h) => h.kind === 'doc' && h.source.includes('01-webhook.md')), 'deveria achar task')
})

test('status resume contagens, ativas e sessões', async () => {
  const root = await makeProject()
  sessionEnd(root, 'primeira sessão')

  const s = statusReport(root)
  assert.equal(s.counts.queue, 0)
  assert.equal(s.counts.active, 0)
  assert.equal(s.sessions.length, 1)
  assert.equal(s.name, path.basename(root))
})
