import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { openDb, syncFromMarkdown, boardQuery, taskDetails } from '../src/lib/db.js'
import { buildBoard, renderPage, kanbanFor, projectRoot, readTaskFile } from '../src/kanban.js'
import { createProject } from '../src/init.js'
import { tmpdir, write } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Módulo: \`packages/modules/foo\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
- \`packages/modules/foo/src/repo.ts\`
## Critério de conclusão:
- [ ] typecheck
`

async function makeProject(name) {
  const root = path.join(tmpdir(), name)
  const wsSource = path.join(tmpdir(), 'fonte-' + name)
  fs.mkdirSync(wsSource, { recursive: true })
  fs.mkdirSync(path.join(wsSource, '.agents'), { recursive: true })
  fs.mkdirSync(path.join(wsSource, '.opencode', 'agent'), { recursive: true })
  fs.mkdirSync(path.join(wsSource, 'scripts', 'harness'), { recursive: true })
  fs.writeFileSync(path.join(wsSource, 'AGENTS.md'), '# Fonte\n')
  await createProject(root, {}, wsSource, path.join(wsSource, 'AGENTS.md'))
  // limpa as tasks de fundação do template
  for (const sub of ['queue', 'active', 'done']) {
    const dir = path.join(root, 'context', 'agents', sub)
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f))
    }
  }
  return root
}

test('boardQuery: inclui o escopo completo (não só a contagem)', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  const board = boardQuery(db)
  assert.equal(board.queue.length, 1)
  assert.deepEqual(board.queue[0].scope, ['packages/modules/foo/src/index.ts', 'packages/modules/foo/src/repo.ts'])
  assert.equal(board.queue[0].scope_count, 2)
})

test('taskDetails: retorna task + escopo + histórico', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  const d = taskDetails(db, '01-foo.md')
  assert.ok(d)
  assert.equal(d.task.title, 'Foo')
  assert.equal(d.task.scope.length, 2)
  assert.ok(d.events.some((e) => e.event === 'synced'))
  assert.deepEqual(d.interactions, [])
})

function syncProject(root) {
  syncFromMarkdown(openDb(root), root)
}

test('buildBoard: cards multi-projeto carregam o projeto dono', async () => {
  const a = await makeProject('proj-a')
  const b = await makeProject('proj-b')
  write(a, 'context/agents/queue/01-foo.md', TASK)
  write(b, 'context/agents/queue/01-foo.md', TASK) // mesmo id em ambos — não pode misturar
  syncProject(a)
  syncProject(b)

  const board = buildBoard({ projects: [{ name: 'A', root: a }, { name: 'B', root: b }] })
  const qa = board.queue.filter((t) => t.project === 'A')
  const qb = board.queue.filter((t) => t.project === 'B')
  assert.equal(qa.length, 1)
  assert.equal(qb.length, 1)
  assert.equal(qa[0].id, '01-foo.md')
  assert.equal(qb[0].id, '01-foo.md')

  // readTaskFile resolve o arquivo do projeto certo (mesmo id nos dois)
  const ctx = { projects: [{ name: 'A', root: a }, { name: 'B', root: b }] }
  const fa = readTaskFile(ctx, 'A', '01-foo.md')
  const fb = readTaskFile(ctx, 'B', '01-foo.md')
  assert.ok(fa.includes('Task: Foo'))
  assert.equal(fa, fb)

  // projeto desconhecido → erro
  assert.throws(() => projectRoot(ctx, 'X'), /projeto desconhecido/)
})

test('kanbanFor estático: gera HTML com título, card e conteúdo do arquivo embutido', async () => {
  const a = await makeProject('proj-c')
  write(a, 'context/agents/queue/01-foo.md', TASK)
  syncProject(a)

  const out = path.join(tmpdir(), 'kanban-out.html')
  await kanbanFor(
    { kind: 'workspace', projects: [{ name: 'A', root: a }], title: 'Workspace teste' },
    ['--out', out]
  )

  const html = fs.readFileSync(out, 'utf8')
  assert.ok(html.includes('Workspace teste')) // título renderizado
  assert.ok(html.includes('01-foo.md')) // card
  assert.ok(html.includes('packages/modules/foo/src/repo.ts')) // escopo no BOARD_DATA
  assert.ok(html.includes('Task: Foo')) // conteúdo do arquivo embutido (modal estático)
})

test('renderPage: substitui título e dados sem quebrar JSON', () => {
  const html = renderPage({ queue: [], active: [], done: [] }, 'Meu Board <x>')
  assert.ok(html.includes('Meu Board &lt;x&gt;'))
  assert.ok(html.includes('"queue":[]'))
})