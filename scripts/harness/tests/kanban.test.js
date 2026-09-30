import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { openDb, syncFromMarkdown, boardQuery, taskDetails, resolveTaskId } from '../src/lib/db.js'
import { buildBoard, renderPage, kanbanFor, projectRoot, readTaskFile, serveBoard, wipViolation } from '../src/kanban.js'
import { createProject } from '../src/init.js'
import { tmpdir, write, withSilentStdout } from './helpers.js'

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
  await withSilentStdout(async () => {
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
    assert.ok(html.includes('agrupar por módulo')) // toggle de agrupamento presente
  })
})

test('renderPage: substitui título e dados sem quebrar JSON', () => {
  const html = renderPage({ queue: [], active: [], done: [] }, 'Meu Board <x>')
  assert.ok(html.includes('Meu Board &lt;x&gt;'))
  assert.ok(html.includes('"queue":[]'))
})

test('servidor kanban: prefixo ambíguo no detail responde 400 sem derrubar o servidor', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('proj-d')
    write(a, 'context/agents/queue/01-foo.md', TASK)
    write(a, 'context/agents/queue/01-foo-bar.md', TASK) // compartilha o prefixo "01"
    syncProject(a)

    const server = serveBoard({ projects: [{ name: 'A', root: a }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      // prefixo ambíguo → 400 (e não derruba o processo)
      const res = await fetch(`${base}/api/tasks/01/detail?project=A`)
      assert.equal(res.status, 400)
      const body = await res.json()
      assert.ok(body.error.includes('ambíguo'))

      // servidor continua vivo
      const res2 = await fetch(`${base}/api/board`)
      assert.equal(res2.status, 200)

      // id exato resolve (detalhe real)
      const res3 = await fetch(`${base}/api/tasks/${encodeURIComponent('01-foo.md')}/detail?project=A`)
      assert.equal(res3.status, 200)
    } finally {
      server.close()
    }
  })
})

test('wipViolation: bloqueia move que estoura o limite da coluna (A1)', () => {
  const board = {
    queue: [
      { id: '01.md', project: 'A' },
      { id: '02.md', project: 'A' }
    ],
    active: [{ id: '03.md', project: 'A' }],
    done: [],
    wip: { A: { queue: 2, active: 1 } }
  }

  // dentro do limite → null
  assert.equal(wipViolation(board, 'A', 'active', { queue: 2, active: 2 }), null)
  assert.equal(wipViolation(board, 'A', 'done', { queue: 2, active: 2 }), null)

  // no limite de active (1/1) → bloqueia
  const err = wipViolation(board, 'A', 'active', { queue: 2, active: 1 })
  assert.ok(err && err.includes('WIP'))

  // limite de queue (2/2) ao mover para queue → bloqueia
  const errQ = wipViolation(board, 'A', 'queue', { queue: 2, active: 1 })
  assert.ok(errQ && errQ.includes('WIP'))

  // sem limite configurado → null
  assert.equal(wipViolation(board, 'A', 'active', { queue: null, active: null }), null)

  // projetos diferentes não se misturam
  assert.equal(wipViolation(board, 'B', 'active', { queue: null, active: 1 }), null)
})

test('servidor kanban: WIP bloqueia move no projeto dono (A1)', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('proj-e')
    write(a, '.harness/kanban.json', JSON.stringify({ wip: { active: 1 } }))
    write(a, 'context/agents/queue/01-foo.md', TASK)
    write(a, 'context/agents/queue/02-bar.md', TASK)
    syncProject(a)

    const server = serveBoard({ projects: [{ name: 'A', root: a, wip: { queue: null, active: 1 } }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      // move 01 para active → ok (fica 1/1)
      const m1 = await fetch(`${base}/api/tasks/${encodeURIComponent('01-foo.md')}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'active', project: 'A' })
      })
      assert.equal(m1.status, 200, await m1.text())

      // move 02 para active → bloqueado pelo WIP (1/1)
      const m2 = await fetch(`${base}/api/tasks/${encodeURIComponent('02-bar.md')}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'active', project: 'A' })
      })
      assert.equal(m2.status, 400)
      const body = await m2.json()
      assert.ok(body.error.includes('WIP'))
    } finally {
      server.close()
    }
  })
})