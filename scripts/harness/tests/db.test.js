import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { openDb, syncFromMarkdown, findDrift } from '../src/lib/db.js'
import { queueDir, activeDir } from '../src/lib/tasks.js'
import { tmpdir, write } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Módulo: \`packages/modules/foo\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
## Critério de conclusão:
- [ ] typecheck
`

test('syncFromMarkdown indexa tasks e findDrift detecta drift', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', TASK)
  const db = openDb(root)

  const changed = syncFromMarkdown(db, root)
  assert.equal(changed.length, 1)
  assert.deepEqual(changed[0], { id: '01-foo.md', to: 'queue' })
  assert.deepEqual(findDrift(db, root), [])

  fs.mkdirSync(activeDir(root), { recursive: true })
  fs.renameSync(
    path.join(queueDir(root), '01-foo.md'),
    path.join(activeDir(root), '01-foo.md')
  )
  const drift = findDrift(db, root)
  assert.equal(drift.length, 1)
  assert.equal(drift[0].id, '01-foo.md')
  assert.equal(drift[0].db, 'queue')
  assert.equal(drift[0].md, 'active')

  const resynced = syncFromMarkdown(db, root)
  assert.ok(resynced.some((c) => c.id === '01-foo.md' && c.to === 'active'))
  assert.deepEqual(findDrift(db, root), [])
})

test('syncFromMarkdown remove órfãos do banco', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', TASK)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks').get().c, 1)

  fs.rmSync(path.join(queueDir(root), '01-foo.md'))
  const changed = syncFromMarkdown(db, root)
  assert.ok(changed.some((c) => c.id === '01-foo.md' && c.to.includes('removed')))
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tasks').get().c, 0)
})