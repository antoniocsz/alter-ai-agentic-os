import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  listTasks,
  parseTask,
  pathsOverlap,
  findConflicts,
  moveTask,
  resolveTaskName,
  queueDir,
  activeDir
} from '../src/lib/tasks.js'
import { tmpdir, write } from './helpers.js'

const TASK = `# Task: Foo
## Agente: \`backend\`
## Módulo: \`packages/modules/foo\`
## Escopo (arquivos que esta task vai tocar):
- \`packages/modules/foo/src/index.ts\`
- \`packages/modules/foo/src/domain/entities/entity.ts\`
## Depende de: [ ] \`01-bar.md\`
## Critério de conclusão:
- [ ] typecheck
`

test('parseTask: extrai seções, valores e escopo', () => {
  const root = tmpdir()
  const f = write(root, 'context/agents/queue/01-foo.md', TASK)
  const t = parseTask(f)
  assert.equal(t.name, '01-foo.md')
  assert.deepEqual(t.scope, [
    'packages/modules/foo/src/index.ts',
    'packages/modules/foo/src/domain/entities/entity.ts'
  ])
  assert.ok(Object.keys(t.sections).some((k) => k.toLowerCase().includes('escopo')))
  assert.equal(t.values['Agente'], '`backend`')
  assert.equal(t.values['Depende de'], '[ ] `01-bar.md`')
})

test('parseTask: escopo ignora linhas sem bullet e checkboxes', () => {
  const root = tmpdir()
  const f = write(
    root,
    'q/01-foo.md',
    `# Task: Foo
## Escopo:
texto livre
- \`src/a.ts\`
- [ ] \`src/b.ts\`
`
  )
  const t = parseTask(f)
  assert.deepEqual(t.scope, ['src/a.ts', 'src/b.ts'])
})

test('parseTask: escopo vazio quando não há bullet', () => {
  const root = tmpdir()
  const f = write(root, 'q/01-foo.md', '# Task: Foo\n## Escopo:\n(planejar)\n')
  const t = parseTask(f)
  assert.deepEqual(t.scope, [])
})

test('pathsOverlap: exato, aninhado, disjunto e backslash', () => {
  assert.equal(pathsOverlap('src/a.ts', 'src/a.ts'), true)
  assert.equal(pathsOverlap('packages/modules/foo', 'packages/modules/foo/src/index.ts'), true)
  assert.equal(pathsOverlap('packages/modules/foo/src/index.ts', 'packages/modules/foo'), true)
  assert.equal(pathsOverlap('src/a.ts', 'src/b.ts'), false)
  assert.equal(pathsOverlap('packages/modules/foo', 'packages/modules/bar'), false)
  assert.equal(pathsOverlap('src\\a.ts', 'src/a.ts'), true)
  assert.equal(pathsOverlap('src/a', 'src/ab'), false)
})

test('findConflicts: detecta sobreposição e ignora disjunto', () => {
  const A = { name: 'A', scope: ['packages/modules/foo/src'] }
  const B = { name: 'B', scope: ['packages/modules/foo/src/index.ts'] }
  const C = { name: 'C', scope: ['packages/modules/bar'] }
  const D = { name: 'D', scope: [] }
  assert.equal(findConflicts([A, B]).length, 1)
  assert.equal(findConflicts([A, C]).length, 0)
  assert.equal(findConflicts([A, D]).length, 0)
})

test('moveTask: move arquivo e lança se destino existe', () => {
  const root = tmpdir()
  const from = queueDir(root)
  const to = activeDir(root)
  write(root, 'context/agents/queue/01-foo.md', TASK)
  moveTask(root, '01-foo.md', from, to)
  assert.ok(!fs.existsSync(path.join(from, '01-foo.md')))
  assert.ok(fs.existsSync(path.join(to, '01-foo.md')))
  assert.throws(() => moveTask(root, '01-foo.md', from, to), /não encontrada/)
})

test('resolveTaskName: nome completo, prefixo, ambíguo e ausente', () => {
  const root = tmpdir()
  const q = queueDir(root)
  write(root, 'context/agents/queue/01-foo.md', TASK)
  write(root, 'context/agents/queue/01-bar.md', TASK.replace('Foo', 'Bar'))
  write(root, 'context/agents/queue/02-x.md', TASK.replace('Foo', 'X'))
  assert.equal(resolveTaskName(q, '01-foo.md'), '01-foo.md')
  assert.equal(resolveTaskName(q, '02'), '02-x.md')
  assert.throws(() => resolveTaskName(q, '01'), /ambíguo/)
  assert.throws(() => resolveTaskName(q, '99'), /nenhuma task/)
})

test('listTasks: só .md, ordenado', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/02-b.md', TASK)
  write(root, 'context/agents/queue/01-a.md', TASK)
  write(root, 'context/agents/queue/.gitkeep', '')
  assert.deepEqual(listTasks(queueDir(root)), ['01-a.md', '02-b.md'])
})