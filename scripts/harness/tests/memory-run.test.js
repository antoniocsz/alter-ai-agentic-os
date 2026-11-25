// Memória em níveis na execução (feature memoria-em-niveis, task 119): seção `memory` no pacote
// de contexto (relevância + orçamento + global autorizado) e colheita do bloco MEMÓRIA: do agente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, syncFromMarkdown } from '../src/lib/db.js'
import { buildContextPackage, renderContextMarkdown } from '../src/lib/context.js'
import { addMemory, getMemory, listMemories, openGlobalDb, parseMemoryBlock } from '../src/lib/memories.js'
import { runTool } from '../src/lib/runner.js'
import { buildPrompt } from '../src/run.js'
import * as claude from '../src/lib/runtimes/claude.js'
import { tmpdir, write } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures', 'runtimes')
const FAKE = path.join(FIXTURES, 'fake-claude.js')

const TASK = `# Task: runner lê stdout do agente
## Agente: \`backend\` | Módulo: \`harness\` | Prioridade: P2 | Tipo: feat
## Feature: —
## Escopo (arquivos que esta task vai tocar):
- \`src/runner.js\`
## Depende de: —
## O que já existe: runner com spawn e stdin
## Critério de conclusão:
- [ ] ok
`

function project(cfg = {}) {
  const root = tmpdir()
  write(root, 'harness.json', JSON.stringify({ profile: 'script', ...cfg }))
  write(root, 'tasks/active/07-runner.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  return { root, db }
}

function envWith(extra = {}) {
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

test('parseMemoryBlock: tipos e níveis em pt/en, tags, ignora linhas fora do formato e para no fim do bloco', () => {
  const items = parseMemoryBlock('resumo\n\n**MEMÓRIA:**\n- Decisão [Conhecimento]: usar FTS5 para a busca #db\n- descoberta: o CI roda no Ubuntu sem pnpm\n- fact [project]: porta padrão 4310\n- palpite: ignorado por tipo desconhecido\n- fato: curto\n\ntexto depois')
  assert.deepEqual(items, [
    { kind: 'decision', level: 'knowledge', content: 'usar FTS5 para a busca', tags: ['db'] },
    { kind: 'discovery', level: 'task', content: 'o CI roda no Ubuntu sem pnpm', tags: [] },
    { kind: 'fact', level: 'project', content: 'porta padrão 4310', tags: [] }
  ])
  assert.deepEqual(parseMemoryBlock('sem bloco nenhum'), [])
  assert.deepEqual(parseMemoryBlock('Memoria:\n- fato [global]: agente não escreve no global'), [], 'global não é nível aceito do agente')
  assert.match(buildPrompt('07-x.md', 'corpo', { path: '/wt', branch: 'b' }), /MEMÓRIA:/)
})

test('contexto: seção memory traz ativas relevantes (task, agente, projeto, conhecimento), sem propostas; touch registra acesso', () => {
  const { root, db } = project()
  const own = addMemory(db, { content: 'Task 07: não mexer no parser de flags', level: 'task', scope: '07-runner.md' }).memory
  const ag = addMemory(db, { content: 'Backend: o runner precisa matar a árvore de processos no stop', level: 'agent', scope: 'backend' }).memory
  const kn = addMemory(db, { content: 'Prompt do agente vai pelo stdin do runner, nunca pelo argv', level: 'knowledge', kind: 'decision' }).memory
  addMemory(db, { content: 'Tema do canvas é escuro', level: 'project' })
  addMemory(db, { content: 'Runner com stdout proposto pelo agente', level: 'project', source: 'agent' })
  addMemory(db, { content: 'Frontend: runner na UI', level: 'agent', scope: 'frontend' })
  db.close()

  const pkg = buildContextPackage(root, '07', { touch: true })
  const mem = pkg.sections.find((s) => s.id === 'memory')
  assert.ok(mem, 'seção memory presente')
  assert.match(mem.content, /não mexer no parser de flags/)
  assert.match(mem.content, /matar a árvore/)
  assert.match(mem.content, /\[conhecimento · decisão\] Prompt do agente vai pelo stdin/)
  assert.doesNotMatch(mem.content, /Tema do canvas|proposto pelo agente|Frontend/)
  assert.deepEqual(pkg.memory.items, 3)
  assert.match(renderContextMarkdown(pkg), /## \[memory\] Memória do projeto/)

  const check = openDb(root)
  assert.equal(getMemory(check, kn.id).access_count, 1, 'acesso registrado')
  assert.equal(getMemory(check, own.id).access_count, 1)
  assert.equal(getMemory(check, ag.id).access_count, 1)
  check.close()

  const preview = buildContextPackage(root, '07')
  assert.ok(preview.sections.some((s) => s.id === 'memory'))
  const again = openDb(root)
  assert.equal(getMemory(again, kn.id).access_count, 1, 'prévia (harness context) não conta acesso')
  again.close()
})

test('contexto: memory.budget limita/desliga; global só com memory.global e HARNESS_HOME', () => {
  const home = tmpdir()
  const env = { ...process.env, HARNESS_HOME: home }
  const gdb = openGlobalDb(env)
  addMemory(gdb, { content: 'Preferência global: runner com logs em português', level: 'global' })
  gdb.close()

  const off = project({ memory: { budget: 0 } })
  addMemory(off.db, { content: 'Runner usa stdout por linha', level: 'project' })
  off.db.close()
  assert.ok(!buildContextPackage(off.root, '07', { env }).sections.some((s) => s.id === 'memory'), 'budget 0 desliga')

  const noGlobal = project()
  addMemory(noGlobal.db, { content: 'Runner usa stdout por linha', level: 'project' })
  noGlobal.db.close()
  assert.doesNotMatch(buildContextPackage(noGlobal.root, '07', { env }).sections.find((s) => s.id === 'memory').content, /Preferência global/)

  const withGlobal = project({ memory: { global: true, budget: 400 } })
  addMemory(withGlobal.db, { content: 'Runner usa stdout por linha', level: 'project' })
  withGlobal.db.close()
  const pkg = buildContextPackage(withGlobal.root, '07', { env })
  const mem = pkg.sections.find((s) => s.id === 'memory')
  assert.match(mem.content, /Preferência global: runner com logs em português/)
  assert.match(mem.source, /memória global/)
})

test('run concluído: bloco MEMÓRIA: vira memórias propostas com origem no run; run com falha não colhe', async () => {
  const { root, db } = project()
  const ok = await runTool({ db, taskId: '07-runner.md', cwd: root, driver: claude, prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: path.join(FIXTURES, 'claude-memory.jsonl') }) })
  assert.equal(ok.status, 'completed')
  assert.equal(ok.memories, 3)
  const props = listMemories(db, { status: 'proposed' })
  assert.deepEqual(
    props.map((m) => [m.level, m.scope, m.kind, m.source, m.source_agent, m.run_id, m.task_id]).sort(),
    [
      ['agent', 'backend', 'assumption', 'agent', 'backend', ok.runId, '07-runner.md'],
      ['knowledge', null, 'decision', 'agent', 'backend', ok.runId, '07-runner.md'],
      ['task', '07-runner.md', 'discovery', 'agent', 'backend', ok.runId, '07-runner.md']
    ]
  )
  assert.deepEqual(props.find((m) => m.level === 'task').tags, ['runner', 'testes'])
  assert.equal(props.find((m) => m.kind === 'assumption').confidence, 0.6)
  assert.ok(!buildContextPackage(root, '07').sections.some((s) => s.id === 'memory'), 'propostas não entram no contexto')

  const again = await runTool({ db, taskId: '07-runner.md', cwd: root, driver: claude, prompt: 'x', env: envWith({ FAKE_TRANSCRIPT: path.join(FIXTURES, 'claude-memory.jsonl') }) })
  assert.equal(again.memories, 0, 'mesmo bloco de novo: dedupe')

  const failed = await runTool({ db, taskId: '07-runner.md', cwd: root, driver: claude, prompt: 'x', env: envWith({ FAKE_EXIT: '1', FAKE_TRANSCRIPT: path.join(FIXTURES, 'claude-memory.jsonl') }) })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.memories, 0)
  db.close()
})
