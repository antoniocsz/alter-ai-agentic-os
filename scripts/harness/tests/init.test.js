import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { init } from '../src/init.js'
import { validate } from '../src/check.js'
import { tmpdir, write } from './helpers.js'

test('init: gera projeto com a camada harness genérica', () => {
  const target = path.join(tmpdir(), 'meu-projeto')
  init([target])

  for (const rel of [
    'AGENTS.md',
    '.agents/codegen.md',
    '.opencode/agent/backend.md',
    'scripts/harness/bin/harness.js',
    'context/project/overview.md',
    'context/project/stack.md',
    'context/project/adr/ADR-000-template.md',
    'context/agents/queue',
    'context/agents/active',
    'context/agents/done',
    'turbo.json',
    'pnpm-workspace.yaml',
    'package.json',
    'apps/api/src/server.ts',
    'apps/web/src/app/page.tsx',
    'packages/contracts/src/index.ts',
    'opencode.json',
    '.github/workflows/ci.yml'
  ]) {
    assert.ok(fs.existsSync(path.join(target, rel)), `faltou: ${rel}`)
  }

  const agents = fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8')
  assert.ok(agents.includes('## Perfil do projeto'))
  assert.ok(!agents.includes('## Stack do projeto'))
  assert.ok(!agents.includes('## Hierarquia de tenancy'))
  assert.ok(!agents.includes('## Estrutura do monorepo'))
  assert.ok(agents.includes('@<escopo>'))

  assert.ok(fs.existsSync(path.join(target, 'context', 'modules', 'tenancy', 'context.md')))
  assert.ok(fs.existsSync(path.join(target, 'context', 'agents', 'queue', '01-module-tenancy.md')))
})

test('init: --bare remove módulos e tasks padrão', () => {
  const target = path.join(tmpdir(), 'bare-projeto')
  init([target, '--bare'])

  for (const m of ['tenancy', 'auth', 'authorization', 'audit']) {
    assert.ok(!fs.existsSync(path.join(target, 'context', 'modules', m)), `módulo padrão presente: ${m}`)
  }
  const queue = fs.readdirSync(path.join(target, 'context', 'agents', 'queue'))
  assert.deepEqual(queue.filter((f) => f.endsWith('.md')), [])
})

test('init: projeto gerado passa no harness check', () => {
  const target = path.join(tmpdir(), 'check-projeto')
  init([target])
  const r = validate(target)
  assert.equal(r.ok, true, r.errors.join('\n'))
})

test('init: rejeita diretório não vazio', async () => {
  const root = tmpdir()
  write(root, 'algum-arquivo.txt', 'x')
  await assert.rejects(() => init([root]), /não está vazio/)
})

test('init: --prisma gera packages/database no padrão diasbellazzi', () => {
  const target = path.join(tmpdir(), 'prisma-projeto')
  init([target, '--prisma'])

  const pkgPath = path.join(target, 'packages', 'database', 'package.json')
  assert.ok(fs.existsSync(pkgPath), 'faltou packages/database/package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  assert.equal(pkg.name, '@saas/database')

  for (const rel of [
    'packages/database/src/config.ts',
    'packages/database/src/client.ts',
    'packages/database/src/index.ts',
    'packages/database/prisma.config.ts',
    'packages/database/prisma/seed.ts'
  ]) {
    assert.ok(fs.existsSync(path.join(target, rel)), `faltou: ${rel}`)
  }

  // Renomeado (git mv), não duplicado: o path antigo não pode existir.
  assert.ok(!fs.existsSync(path.join(target, 'packages', 'prisma')), 'pasta antiga ainda existe')

  const cfg = fs.readFileSync(path.join(target, 'packages', 'database', 'prisma.config.ts'), 'utf8')
  assert.ok(cfg.includes('databaseUrl()'), 'prisma.config.ts não usa databaseUrl()')
  assert.ok(cfg.includes('import.meta.dirname'), 'prisma.config.ts não usa import.meta.dirname')
})
