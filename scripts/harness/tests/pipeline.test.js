import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startTask, finishTask, requeueTask, reopenTask } from '../src/lib/pipeline.js'
import { queueDir, activeDir, doneDir } from '../src/lib/tasks.js'
import { tmpdir, write, gitInit } from './helpers.js'

function taskMd(module, extra = '') {
  return `# Task: ${module}
## Agente: \`backend\`
## Módulo: \`packages/modules/${module}\`
## Escopo (arquivos que esta task vai tocar):
- \`packages/modules/${module}/src/index.ts\`
${extra}
## Critério de conclusão:
- [ ] typecheck
`
}

test('startTask: queue → active e bloqueia conflito de escopo', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  const r1 = startTask(root, '01')
  assert.equal(r1.ok, true)
  assert.equal(r1.name, '01-foo.md')
  assert.ok(fs.existsSync(path.join(activeDir(root), '01-foo.md')))
  assert.ok(!fs.existsSync(path.join(queueDir(root), '01-foo.md')))

  assert.throws(() => startTask(root, '01'), /nenhuma task em queue/)

  write(root, 'context/agents/queue/02-outro.md', taskMd('foo'))
  const r2 = startTask(root, '02-outro.md')
  assert.equal(r2.ok, false)
  assert.match(r2.error, /conflito de escopo/)
})

test('startTask: escopos disjuntos rodam em paralelo', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  write(root, 'context/agents/queue/02-bar.md', taskMd('bar'))
  assert.equal(startTask(root, '01').ok, true)
  const r2 = startTask(root, '02')
  assert.equal(r2.ok, true)
  assert.deepEqual(r2.parallel, ['01-foo.md'])
})

test('finishTask: valida escopo via git diff e move para done', () => {
  const root = tmpdir()
  write(root, '.gitignore', '.harness/\n')
  write(root, 'README.md', 'x')
  gitInit(root)
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  assert.equal(startTask(root, '01').ok, true)

  write(root, 'packages/modules/foo/src/index.ts', '// dentro do escopo')
  const r = finishTask(root, '01')
  assert.equal(r.ok, true)
  assert.ok(fs.existsSync(path.join(doneDir(root), '01-foo.md')))
  assert.ok(!fs.existsSync(path.join(activeDir(root), '01-foo.md')))
})

test('finishTask: arquivo fora do escopo bloqueia', () => {
  const root = tmpdir()
  write(root, '.gitignore', '.harness/\n')
  write(root, 'README.md', 'x')
  gitInit(root)
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  assert.equal(startTask(root, '01').ok, true)

  write(root, 'arquivo-secreto.ts', '// fora do escopo')
  const r = finishTask(root, '01')
  assert.equal(r.ok, false)
  assert.match(r.error, /fora do escopo/)
  assert.ok(fs.existsSync(path.join(activeDir(root), '01-foo.md')))
})

test('finishTask sem repositório git: enforcement é pulado', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  assert.equal(startTask(root, '01').ok, true)
  write(root, 'qualquer-coisa.ts', '// sem git')
  const r = finishTask(root, '01')
  assert.equal(r.ok, true)
  assert.equal(r.gitRepo, false)
})

test('requeueTask e reopenTask', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', taskMd('foo'))
  assert.equal(startTask(root, '01').ok, true)

  const rq = requeueTask(root, '01')
  assert.equal(rq.ok, true)
  assert.ok(fs.existsSync(path.join(queueDir(root), '01-foo.md')))

  assert.equal(startTask(root, '01').ok, true)
  assert.equal(finishTask(root, '01').ok, true)

  const ro = reopenTask(root, '01')
  assert.equal(ro.ok, true)
  assert.ok(fs.existsSync(path.join(activeDir(root), '01-foo.md')))
})