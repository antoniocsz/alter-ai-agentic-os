import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '../src/check.js'
import { tmpdir, write } from './helpers.js'

function validTask(name) {
  return `# Task: ${name}
## Agente: \`backend\`
## Módulo: \`packages/modules/foo\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
## Critério de conclusão:
- [ ] typecheck
`
}

function project(root) {
  write(root, 'context/project/overview.md', '# Overview')
  write(root, 'context/project/stack.md', '# Stack')
  write(root, 'context/project/adr/ADR-000-template.md', '# ADR template')
  write(root, 'context/modules/foo/context.md', '# Context')
  write(root, 'context/modules/foo/status.md', '# Status')
}

test('validate: projeto válido passa', () => {
  const root = tmpdir()
  project(root)
  write(root, 'context/agents/queue/01-foo.md', validTask('foo'))
  const r = validate(root)
  assert.equal(r.ok, true)
  assert.deepEqual(r.errors, [])
})

test('validate: nome de arquivo inválido', () => {
  const root = tmpdir()
  project(root)
  write(root, 'context/agents/queue/nao-numerada.md', validTask('x'))
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('nome inválido')))
})

test('validate: seção obrigatória ausente', () => {
  const root = tmpdir()
  project(root)
  write(root, 'context/agents/queue/01-foo.md', '# Task: x\n## Escopo:\n- `a.ts`\n')
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('seção obrigatória ausente')))
})

test('validate: conflito de escopo entre tasks ativas', () => {
  const root = tmpdir()
  project(root)
  write(root, 'context/agents/active/01-a.md', validTask('a'))
  write(root, 'context/agents/active/02-b.md', validTask('b'))
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('conflito de escopo')))
})

test('validate: task em mais de uma pasta', () => {
  const root = tmpdir()
  project(root)
  write(root, 'context/agents/queue/01-a.md', validTask('a'))
  write(root, 'context/agents/done/01-a.md', validTask('a'))
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('mais de uma pasta')))
})

test('validate: falta overview/stack/adr', () => {
  const root = tmpdir()
  write(root, 'context/agents/queue/01-foo.md', validTask('foo'))
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('overview.md')))
  assert.ok(r.errors.some((e) => e.includes('stack.md')))
})

test('validate: task com módulo placeholder não gera violação falsa', () => {
  const root = tmpdir()
  project(root)
  write(
    root,
    'context/agents/queue/01-foo.md',
    `# Task: foo
## Agente: \`backend\`
## Módulo: \`packages/modules/<modulo>\`
## Escopo:
- \`packages/modules/foo/src/index.ts\`
## Critério de conclusão:
- [ ] typecheck
`
  )
  const r = validate(root)
  assert.equal(r.ok, true, r.errors.join('\n'))
})

test('validate: módulo da task sem context.md/status.md', () => {
  const root = tmpdir()
  project(root)
  write(
    root,
    'context/agents/queue/01-barr.md',
    `# Task: barr
## Agente: \`backend\`
## Módulo: \`packages/modules/bar\`
## Escopo:
- \`packages/modules/bar/src/index.ts\`
## Critério de conclusão:
- [ ] typecheck
`
  )
  const r = validate(root)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some((e) => e.includes('módulo sem context.md')))
})