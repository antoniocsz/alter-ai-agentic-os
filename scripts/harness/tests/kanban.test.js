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
    const dir = path.join(root, 'tasks', sub)
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f))
    }
  }
  return root
}

test('boardQuery: inclui o escopo completo (não só a contagem)', () => {
  const root = tmpdir()
  write(root, 'tasks/queue/01-foo.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  const board = boardQuery(db)
  assert.equal(board.queue.length, 1)
  assert.deepEqual(board.queue[0].scope, ['packages/modules/foo/src/index.ts', 'packages/modules/foo/src/repo.ts'])
  assert.equal(board.queue[0].scope_count, 2)
})

test('taskDetails: retorna task + escopo + histórico', () => {
  const root = tmpdir()
  write(root, 'tasks/queue/01-foo.md', TASK)
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
  write(a, 'tasks/queue/01-foo.md', TASK)
  write(b, 'tasks/queue/01-foo.md', TASK) // mesmo id em ambos — não pode misturar
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
    write(a, 'tasks/queue/01-foo.md', TASK)
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
    write(a, 'tasks/queue/01-foo.md', TASK)
    write(a, 'tasks/queue/01-foo-bar.md', TASK) // compartilha o prefixo "01"
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
    write(a, 'tasks/queue/01-foo.md', TASK)
    write(a, 'tasks/queue/02-bar.md', TASK)
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
test('buildBoard: card ativo carrega a branch da worktree', async () => {
  const root = await makeProject('proj-wt')
  write(root, 'tasks/active/01-foo.md', TASK)
  fs.mkdirSync(path.join(root, '.harness'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.harness', 'worktrees.json'),
    JSON.stringify({
      worktrees: [{ task: '01-foo.md', branch: 'task/01-foo', path: '.worktrees/task-01-foo' }]
    })
  )

  const board = buildBoard({ projects: [{ name: 'WT', root }] })
  const card = board.active.find((t) => t.project === 'WT')
  assert.equal(card.worktree, 'task/01-foo')
})

test('servidor kanban: rejeita id malformado/traversal e protege o move (CSRF/content-type)', async () => {
  await withSilentStdout(async () => {
    const root = await makeProject('proj-sec')
    write(root, 'tasks/queue/01-foo.md', TASK)
    syncProject(root)

    const server = serveBoard({ projects: [{ name: 'A', root }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`
    const moveUrl = (id) => `${base}/api/tasks/${id}/move`

    try {
      const malformed = await fetch(`${base}/api/tasks/%/detail?project=A`)
      assert.equal(malformed.status, 400)

      const traversal = await fetch(
        `${base}/api/tasks/${encodeURIComponent('../../README.md')}/detail?project=A`
      )
      assert.equal(traversal.status, 400)

      const csrf = await fetch(moveUrl('01-foo.md'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://evil.test' },
        body: JSON.stringify({ to: 'active', project: 'A' })
      })
      assert.equal(csrf.status, 403)

      const wrongType = await fetch(moveUrl('01-foo.md'), {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ to: 'active', project: 'A' })
      })
      assert.equal(wrongType.status, 415)

      const alive = await fetch(`${base}/api/board`)
      assert.equal(alive.status, 200)
    } finally {
      server.close()
    }
  })
})

test('servidor kanban: vista Execução /canvas serve a página alimentada por /api/canvas (AC-1)', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('canvas-vista')
    write(a, 'tasks/active/01-foo.md', TASK)
    syncProject(a)

    const server = serveBoard({ projects: [{ name: 'A', root: a }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      const page = await fetch(`${base}/canvas`)
      assert.equal(page.status, 200)
      const html = await page.text()
      assert.ok(html.includes('id="canvas-grid"')) // grid principal
      assert.ok(html.includes('/api/canvas')) // dados da vista
      assert.ok(html.includes('Nada em execução agora')) // estado vazio declarado
      assert.ok(html.includes('stale')) // classe/badge de staleness
      assert.ok(html.includes('/detail')) // modal de histórico chamado
      assert.ok(html.includes('setInterval(loadCanvas, 3000)')) // auto-refresh 3s

      // a mesma instância serve os dados que alimentam a vista
      const data = await (await fetch(`${base}/api/canvas`)).json()
      assert.equal(data.ok, true)
      assert.equal(data.canvas.length, 1)
      assert.equal(data.canvas[0].id, '01-foo.md')
      assert.equal(data.canvas[0].worktree, 'raiz')
      assert.equal(data.canvas[0].stale, false)
    } finally {
      server.close()
    }
  })
})

test('servidor kanban: link de navegação board ⇄ Execução (vice-versa, modo serve)', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('canvas-nav')
    const server = serveBoard({ projects: [{ name: 'A', root: a }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      // board visa a vista Execução (link injetado no modo serve)
      const boardHtml = await (await fetch(`${base}/`)).text()
      assert.ok(boardHtml.includes('href="/canvas"'))

      // a vista Execução visa o board
      const canvasHtml = await (await fetch(`${base}/canvas`)).text()
      assert.ok(canvasHtml.includes('href="/"'))
      assert.ok(canvasHtml.includes('← Board'))
    } finally {
      server.close()
    }
  })
})

test('servidor kanban: vista Execução reflete moves em tempo real (pipeline do board intacto — AC-7)', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('canvas-live')
    write(a, 'tasks/queue/01-foo.md', TASK)
    syncProject(a)

    const server = serveBoard({ projects: [{ name: 'A', root: a }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      // task na queue não aparece no canvas
      const before = await (await fetch(`${base}/api/canvas`)).json()
      assert.deepEqual(before.canvas, [])

      // move pela API existente do board é a mesma mecânica de drag&drop
      const moved = await fetch(`${base}/api/tasks/${encodeURIComponent('01-foo.md')}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'active', project: 'A' })
      })
      assert.equal(moved.status, 200, await moved.text())

      // canvas recarregado mostra a task ao vivo com tempo de execução
      const after = await (await fetch(`${base}/api/canvas`)).json()
      assert.equal(after.canvas.length, 1)
      assert.equal(after.canvas[0].id, '01-foo.md')
      assert.equal(typeof after.canvas[0].running_ms, 'number')
      assert.ok(after.canvas[0].running_ms >= 0)
    } finally {
      server.close()
    }
  })
})

test('servidor kanban: vista Execução é read-only (v1) — POST nos endpoints da vista → 404', async () => {
  await withSilentStdout(async () => {
    const a = await makeProject('canvas-ro')
    write(a, 'tasks/active/01-foo.md', TASK)
    syncProject(a)

    const server = serveBoard({ projects: [{ name: 'A', root: a }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      const postPage = await fetch(`${base}/canvas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'kill' })
      })
      assert.equal(postPage.status, 404)

      const postApi = await fetch(`${base}/api/canvas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'restart' })
      })
      assert.equal(postApi.status, 404)

      // rota GET da vista permanece 200 (nenhuma ação mudou o board)
      assert.equal((await fetch(`${base}/canvas`)).status, 200)
    } finally {
      server.close()
    }
  })
})
