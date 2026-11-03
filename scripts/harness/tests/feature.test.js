import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { featureCmd } from '../src/feature.js'
import { validate } from '../src/check.js'
import { tmpdir, write } from './helpers.js'

function setupRoot() {
  const root = tmpdir()
  for (const d of ['context/project/adr', 'context/modules', 'tasks/queue', 'tasks/active', 'tasks/done']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  write(root, 'context/project/overview.md', '# Overview\n')
  write(root, 'context/project/stack.md', '# Stack\n')
  return root
}

const TASK = `# Task: Implementar billing
## Agente: \`backend\`
## Módulo: —
## Feature: billing
## Escopo (arquivos que esta task vai tocar):
- \`src/billing.ts\`
## Depende de: [ ] —
## Contexto para ler: context/modules/billing/context.md
## Skills a carregar: codegen.md
## O que já existe: —
## O que criar:
- \`src/billing.ts\`
## Especificação: —
## Critério de conclusão:
- [ ] testes
## Complexidade: baixa
`

test('feature: cria spec.md + plan.md e recusa duplicado', async () => {
  const root = setupRoot()
  await featureCmd(['billing'], root)

  const spec = fs.readFileSync(path.join(root, 'context/features/billing/spec.md'), 'utf8')
  const plan = fs.readFileSync(path.join(root, 'context/features/billing/plan.md'), 'utf8')
  assert.match(spec, /AC-1/)
  assert.match(plan, /Plano/)

  await assert.rejects(featureCmd(['Billing!'], root), /feature já existe/)
})

test('check: task com feature sem spec.md reprova', () => {
  const root = setupRoot()
  write(root, 'tasks/queue/01-billing.md', TASK)

  const bad = validate(root)
  assert.ok(bad.errors.some((e) => e.includes('feature sem spec.md: billing')), bad.errors.join('\n'))

  fs.mkdirSync(path.join(root, 'context/features/billing'), { recursive: true })
  write(root, 'context/features/billing/spec.md', '# Spec\n')
  const ok = validate(root)
  assert.equal(ok.ok, true, ok.errors.join('\n'))
})
