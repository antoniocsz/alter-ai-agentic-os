import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { startTask } from '../src/lib/pipeline.js'
import { validate } from '../src/check.js'
import { statusReport } from '../src/lib/memory.js'
import { tmpdir, write } from './helpers.js'

function taskMd({ scope = '- `src/a.js`', feature = '—', dep = '—', priority = 'P2', criteria = true } = {}) {
  return (
    '# Task: teste\n' +
    '## Agente: `backend`\n' +
    '## Módulo: —\n' +
    `## Feature: ${feature}\n` +
    `## Prioridade: ${priority}\n` +
    '## Escopo (arquivos que esta task vai tocar):\n' +
    `${scope}\n` +
    `## Depende de: [ ] \`${dep}\`\n` +
    '## Contexto para ler: —\n' +
    '## Skills a carregar: —\n' +
    '## O que já existe: —\n' +
    '## O que criar:\n- nada\n' +
    '## Especificação: —\n' +
    (criteria ? '## Critério de conclusão:\n- [ ] ok\n' : '') +
    '## Complexidade: baixa\n'
  )
}

function makeRoot() {
  const root = tmpdir()
  for (const d of ['tasks/queue', 'tasks/active', 'tasks/done', 'context/project/adr', 'context/features']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  write(root, 'context/project/overview.md', '# Overview\n')
  write(root, 'context/project/stack.md', '# Stack\n')
  return root
}

test('DoR: start bloqueia task sem escopo', () => {
  const root = makeRoot()
  write(root, 'tasks/queue/01-sem-escopo.md', taskMd({ scope: '' }))
  const res = startTask(root, '01')
  assert.equal(res.ok, false)
  assert.match(res.error, /## Escopo/)
  assert.ok(fs.existsSync(path.join(root, 'tasks/queue/01-sem-escopo.md')))
})

test('DoR: start bloqueia feature sem spec e dependência não concluída', () => {
  const root = makeRoot()
  write(root, 'tasks/queue/01-feature.md', taskMd({ feature: 'billing' }))
  assert.match(startTask(root, '01').error, /spec da feature/)

  write(root, 'context/features/billing/spec.md', '# Spec\n')
  write(root, 'tasks/queue/02-dep.md', taskMd({ dep: '01' }))
  assert.match(startTask(root, '02').error, /dependência não concluída/)

  write(root, 'tasks/done/01-feature.md', '# Task: done\n')
  const ok = startTask(root, '02')
  assert.equal(ok.ok, true, ok.error)
})

test('DoR: start bloqueia sem critério de conclusão', () => {
  const root = makeRoot()
  write(root, 'tasks/queue/01-sem-aceite.md', taskMd({ criteria: false }))
  assert.match(startTask(root, '01').error, /Critério de conclusão/)
})

test('prioridade: check valida P0..P3 e status ordena a fila', () => {
  const root = makeRoot()
  write(root, 'tasks/queue/01-a.md', taskMd({ priority: 'P2' }))
  write(root, 'tasks/queue/02-b.md', taskMd({ priority: 'P0' }))
  write(root, 'tasks/queue/03-c.md', taskMd({ priority: 'P1' }))

  const s = statusReport(root)
  assert.deepEqual(s.next.map((n) => n.slice(0, 2)), ['02', '03', '01'])
  assert.match(s.next[0], /P0/)

  write(root, 'tasks/queue/04-d.md', taskMd({ priority: 'P9' }))
  const r = validate(root)
  assert.ok(r.errors.some((e) => e.includes('prioridade inválida')), r.errors.join('\n'))
})
