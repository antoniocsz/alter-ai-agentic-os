import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { openDb, syncFromMarkdown, recordInteraction } from '../src/lib/db.js'
import { canvasState, STALE_MS } from '../src/lib/canvas.js'
import { serveBoard } from '../src/kanban.js'
import { createProject } from '../src/init.js'
import { tmpdir, write, gitInit, withSilentStdout } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Módulo: \`harness\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
## Critério de conclusão:
- [ ] testes
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
  for (const sub of ['queue', 'active', 'done']) {
    const dir = path.join(root, 'tasks', sub)
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f))
    }
  }
  return root
}

function syncTask(root) {
  const db = openDb(root)
  syncFromMarkdown(db, root)
  return db
}

function insertEvent(db, taskId, event, minAgo) {
  db.prepare('INSERT INTO task_events (task_id, event, message, at) VALUES (?,?,?,?)').run(
    taskId,
    event,
    '',
    new Date(Date.now() - minAgo * 60_000).toISOString()
  )
}

function insertNote(db, taskId, content, minAgo) {
  db.prepare('INSERT INTO interactions (task_id, kind, content, source, at) VALUES (?,?,?,?,?)').run(
    taskId,
    'note',
    content,
    'cli',
    new Date(Date.now() - minAgo * 60_000).toISOString()
  )
}

test('canvasState: task ativa sem worktree degrada para raiz (n/d sem git)', async () => {
  const root = await makeProject('canvas-root')
  write(root, 'tasks/active/01-foo.md', TASK)
  const db = syncTask(root)
  db.close()

  const state = canvasState({ projects: [{ name: 'A', root }] })
  assert.equal(state.canvas.length, 1)
  const c = state.canvas[0]
  assert.equal(c.id, '01-foo.md')
  assert.equal(c.agent, 'backend')
  assert.equal(c.project, 'A')
  assert.equal(c.worktree, 'raiz')
  assert.equal(c.branch, null)
  assert.equal(c.changed_files, 'n/d') // root não é repo git
  assert.equal(typeof c.running_ms, 'number')
  assert.ok(c.started_at)
  assert.equal(c.last_event.event, 'synced')
  assert.equal(c.last_note, null)
  assert.ok([c.started_at, c.last_event.at].includes(c.last_activity_at))
  assert.equal(c.stale, false)
})

// A atividade inicial (synced + started_at) é retroataida para tornar os offsets
// subsequentes semelhantes ao mundo real: eventos chegam DEPOIS da sincronização.
function backdate(db, taskId, minAgo) {
  const at = new Date(Date.now() - minAgo * 60_000).toISOString()
  db.prepare('UPDATE task_events SET at = ? WHERE task_id = ?').run(at, taskId)
  db.prepare('UPDATE tasks SET started_at = ? WHERE id = ?').run(at, taskId)
}

test('canvasState: worktree registrada aponta path+branch e conta arquivos alterados', async () => {
  const root = await makeProject('canvas-wt')
  write(root, 'tasks/active/01-foo.md', TASK)
  const wtDir = path.join(root, '.worktrees', 'tw-01')
  write(wtDir, 'base.txt', 'commitado') // cria o dir da "worktree"
  gitInit(wtDir) // commitado e limpo
  write(wtDir, 'nova.txt', 'mudanca em curso') // porcelain vai contar este arquivo
  write(
    root,
    '.harness/worktrees.json',
    JSON.stringify({
      worktrees: [{ task: '01-foo.md', branch: 'task/01-foo', path: '.worktrees/tw-01' }]
    })
  )
  const db = syncTask(root)
  db.close()

  const { canvas } = canvasState({ projects: [{ name: 'A', root }] })
  const c = canvas.find((t) => t.id === '01-foo.md')
  assert.equal(c.worktree, '.worktrees/tw-01')
  assert.equal(c.branch, 'task/01-foo')
  assert.ok(Number.isInteger(c.changed_files) && c.changed_files >= 1)
})

test('canvasState: worktree registrada mas ausente no disco degrada para raiz', async () => {
  const root = await makeProject('canvas-wt-missing')
  write(root, 'tasks/active/01-foo.md', TASK)
  write(
    root,
    '.harness/worktrees.json',
    JSON.stringify({
      worktrees: [
        { task: '01-foo.md', branch: 'task/01-foo', path: '.worktrees/tw-gone' } // dir não existe
      ]
    })
  )
  const db = syncTask(root)
  db.close()

  const { canvas } = canvasState({ projects: [{ name: 'A', root }] })
  const c = canvas.find((t) => t.id === '01-foo.md')
  assert.equal(c.worktree, 'raiz')
  assert.equal(c.branch, null) // root não é repo git
  assert.equal(c.changed_files, 'n/d')
})

test('canvasState: db indisponível degrada para markdown + git (started/eventos vazios)', async () => {
  const root = await makeProject('canvas-nodb')
  write(root, 'tasks/active/01-foo.md', TASK)
  write(root, '.harness/harness.db', 'não sou um banco SQLite') // corrompe a db

  const { canvas } = canvasState({ projects: [{ name: 'A', root }] })
  assert.deepEqual(
    canvas.map((c) => c.id),
    ['01-foo.md']
  )
  const c = canvas[0]
  assert.equal(c.agent, 'backend') // veio do markdown
  assert.equal(c.title, 'Foo')
  assert.equal(c.started_at, null)
  assert.equal(c.running_ms, null)
  assert.equal(c.last_event, null)
  assert.equal(c.last_note, null)
  assert.equal(c.last_activity_at, null)
  assert.equal(c.changed_files, 'n/d')
  assert.equal(c.stale, false) // sem atividade registrada, nada a julgar
})

test('canvasState: staleness só quando a atividade mais recente passa de 15 min (AC-4)', async () => {
  const root = await makeProject('canvas-stale')
  write(root, 'tasks/active/01-fresh.md', TASK)
  write(root, 'tasks/active/02-old.md', TASK)
  const db = syncTask(root)

  backdate(db, '01-fresh.md', 30)
  backdate(db, '02-old.md', 30)
  insertEvent(db, '01-fresh.md', 'log', 3) // recente — redefine a atividade da task

  const { canvas } = canvasState({ projects: [{ name: 'A', root }] })
  db.close()
  const fresh = canvas.find((c) => c.id === '01-fresh.md')
  const stale = canvas.find((c) => c.id === '02-old.md')

  assert.equal(fresh.stale, false)
  assert.equal(fresh.last_activity_at, fresh.last_event.at)
  assert.equal(fresh.last_event.event, 'log')
  assert.equal(stale.stale, true)
  assert.equal(stale.last_activity_at, stale.last_event.at)
  assert.equal(stale.last_event.event, 'synced')
})

test('canvasState: última interação note (redigida) entra no cartão e conta como atividade', async () => {
  const root = await makeProject('canvas-note')
  write(root, 'tasks/active/01-fresh.md', TASK)
  write(root, 'tasks/active/02-old.md', TASK)
  const db = syncTask(root)

  backdate(db, '01-fresh.md', 30)
  backdate(db, '02-old.md', 30)
  const FAKE_SK = 'sk-' + 'QWERTYUIOP123456' // concatenação: literal no fonte não casa com o gate secrets
  recordInteraction(db, {
    taskId: '01-fresh.md',
    kind: 'note',
    content: `token ${FAKE_SK} na anotacao`
  })
  insertNote(db, '02-old.md', 'nota velha', STALE_MS / 60_000 + 2)

  const { canvas } = canvasState({ projects: [{ name: 'A', root }] })
  db.close()
  const fresh = canvas.find((c) => c.id === '01-fresh.md')
  const old = canvas.find((c) => c.id === '02-old.md')

  assert.ok(fresh.last_note.content.includes('[REDACTED]'))
  assert.ok(!fresh.last_note.content.includes(FAKE_SK))
  assert.equal(fresh.last_event.event, 'synced') // nota não cria task_event
  assert.equal(fresh.stale, false)
  assert.equal(old.last_note.content, 'nota velha')
  assert.equal(old.stale, true) // interação velha também define a atividade
  assert.equal(old.last_activity_at, old.last_note.at)
})

test('servidor: GET /api/canvas representa tasks ativas e fica vazio sem ativas (AC-2/AC-6)', async () => {
  await withSilentStdout(async () => {
    const root = await makeProject('canvas-route')
    write(root, 'tasks/active/01-foo.md', TASK)
    write(root, 'tasks/queue/02-later.md', TASK)
    const db = syncTask(root)
    db.close()

    const server = serveBoard({ projects: [{ name: 'A', root }], title: 't' }, 0)
    await once(server, 'listening')
    const base = `http://localhost:${server.address().port}`

    try {
      const res = await fetch(`${base}/api/canvas`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.ok, true)
      assert.ok(body.generated_at)
      assert.equal(body.canvas.length, 1) // só a ativa; queue fora
      assert.equal(body.canvas[0].id, '01-foo.md')
      assert.equal(body.canvas[0].agent, 'backend')
      assert.equal(body.canvas[0].worktree, 'raiz')
      assert.equal(typeof body.canvas[0].running_ms, 'number')

      fs.rmSync(path.join(root, 'tasks', 'active', '01-foo.md'))
      const res2 = await fetch(`${base}/api/canvas`)
      assert.equal(res2.status, 200)
      const body2 = await res2.json()
      assert.deepEqual(body2.canvas, [])
    } finally {
      server.close()
    }
  })
})
