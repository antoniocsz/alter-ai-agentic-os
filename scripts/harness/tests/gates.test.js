import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkLinks, checkArtifact, runGates, firstFailure } from '../src/lib/gates.js'
import { finishTask } from '../src/lib/pipeline.js'
import { tmpdir, write } from './helpers.js'

test('links: detecta link relativo quebrado e aceita quando o alvo existe', () => {
  const root = tmpdir()
  write(root, 'docs/guia.md', '# Guia\n\nVeja [alvo](alvo.md) e [externo](https://example.com).\n')

  const broken = checkLinks(root)
  assert.equal(broken.length, 1)
  assert.match(broken[0], /alvo\.md/)

  write(root, 'docs/alvo.md', '# Alvo\n')
  assert.deepEqual(checkLinks(root), [])

  const results = runGates(root, ['links'])
  assert.equal(results[0].status, 'passed')
})

test('artifact: falha sem assets e sem BRIEF preenchido', () => {
  const root = tmpdir()
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
  write(root, 'assets/.gitkeep', '')
  assert.ok(checkArtifact(root))

  write(root, 'BRIEF.md', '# Briefing\n\nObjetivo definido.\n')
  assert.equal(checkArtifact(root), null)

  write(root, 'assets/logo.svg', '<svg></svg>')
  assert.equal(checkArtifact(root), null)
})

test('finish: gate que falha bloqueia a task e mantém active', () => {
  const root = tmpdir()
  for (const d of ['tasks/queue', 'tasks/active', 'tasks/done']) {
    fs.mkdirSync(path.join(root, d), { recursive: true })
  }
  write(root, 'harness.json', JSON.stringify({ profile: 'docs', gates: { finish: ['links'] } }))
  write(root, 'README.md', '# Projeto\n\n[quebrado](nao-existe.md)\n')
  write(
    root,
    'tasks/active/01-doc.md',
    '# Task: doc\n## Agente: `coordinator`\n## Módulo: —\n## Escopo:\n- `docs/x.md`\n## Critério de conclusão:\n- [ ] ok\n'
  )

  const failed = finishTask(root, '01')
  assert.equal(failed.ok, false)
  assert.equal(failed.gateFailure.gate, 'links')
  assert.ok(fs.existsSync(path.join(root, 'tasks/active/01-doc.md')), 'task deveria continuar ativa')
  assert.equal(firstFailure(failed.gates).gate, 'links')

  write(root, 'nao-existe.md', '# Agora existe\n')
  const ok = finishTask(root, '01')
  assert.equal(ok.ok, true, ok.error)
  assert.ok(fs.existsSync(path.join(root, 'tasks/done/01-doc.md')))
})

test('gates: não deixa pnpm-lock.yaml criado pelo script', () => {
  const root = tmpdir()
  write(
    root,
    'package.json',
    JSON.stringify({
      scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'pnpm-lock.yaml\',\'x\')"' }
    })
  )
  const results = runGates(root, ['test'])
  assert.equal(results[0].status, 'passed')
  assert.ok(!fs.existsSync(path.join(root, 'pnpm-lock.yaml')), 'lockfile residual')
})

test('gates: preserva pnpm-lock.yaml pré-existente', () => {
  const root = tmpdir()
  write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
  write(root, 'package.json', JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }))
  runGates(root, ['test'])
  assert.ok(fs.existsSync(path.join(root, 'pnpm-lock.yaml')))
})

test('gates: nome de gate inválido falha sem executar shell', () => {
  const root = tmpdir()
  const results = runGates(root, ['test; echo pwned'])
  assert.equal(results[0].status, 'failed')
  assert.match(results[0].output, /inválido/)
})

test('gates strict: skip por dependências ausentes reprova', () => {
  const root = tmpdir()
  write(root, 'package.json', JSON.stringify({ scripts: { test: 'node -e "0"' }, dependencies: { x: '1' } }))
  assert.equal(runGates(root, ['test'])[0].status, 'skipped')
  const strict = runGates(root, ['test'], { strict: true })[0]
  assert.equal(strict.status, 'failed')
  assert.match(strict.output, /strict/)
})
