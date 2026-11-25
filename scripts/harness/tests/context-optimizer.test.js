// Otimizador de contexto (feature otimizador-de-contexto, task 132): handoffs antigos compactados,
// seções resumidas antes de omitidas, digest do módulo e medição da economia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildContextPackage, compactHandoff, outline } from '../src/lib/context.js'
import { validateConfig } from '../src/lib/config.js'
import { tmpdir, write } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')

const longText = (n) => Array.from({ length: n }, (_, i) => `Detalhe ${i}: o runner lê o stdout por linha e normaliza os eventos do agente.`).join(' ')

const STATUS = `# m1 — Status

## Handoff (task 10 — antiga)
- Feito: implementei o parser de flags. ${longText(12)}
  continua aqui com mais detalhe.
- Pendências: nenhuma.
- Decisões: flags sem valor viram booleanos.

## Handoff (task 11 — do meio)
- Feito: adicionei o runner. ${longText(12)}
- Pendências: validar no Windows.
- Decisões: prompt pelo stdin.

## Handoff (task 12 — recente)
- Feito: lote paralelo. ${longText(6)}
- Pendências: —
- Decisões: pool com limite.
`

function project({ digest = false, optimize } = {}) {
  const root = tmpdir()
  write(root, 'harness.json', JSON.stringify({ profile: 'bare', ...(optimize === undefined ? {} : { context: { optimize } }) }))
  write(root, 'context/modules/m1/context.md', '# Módulo m1\n\nResponsável pelo runner.\n')
  write(root, 'context/modules/m1/status.md', STATUS)
  if (digest) write(root, 'context/modules/m1/digest.md', '- Parser de flags, runner e lote entregues.\n- Prompt sempre pelo stdin.\n')
  write(root, 'context/features/f1/spec.md', `# Spec: f1\n\n## Problema\n${longText(40)}\n\n## Critérios\n- [ ] AC-1 — algo\n${longText(40)}\n`)
  write(root, 'tasks/active/13-x.md', `# Task: x
## Agente: \`backend\` | Módulo: \`m1\` | Prioridade: P2 | Tipo: feat
## Feature: f1
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
## Critério de conclusão:
- [ ] ok
`)
  return root
}

test('otimizador: compactHandoff mantém o essencial; outline guarda títulos + 1ª linha; config validada', () => {
  const c = compactHandoff(STATUS.split('## Handoff (task 11')[1].replace(/^/, '## Handoff (task 11').split('\n\n## ')[0])
  assert.match(c, /^#### Handoff \(task 11 — do meio\)/)
  assert.match(c, /- Feito: adicionei o runner\./)
  assert.match(c, /- Pendências: validar no Windows\./)
  assert.match(c, /- Decisões: prompt pelo stdin\./)
  assert.ok(c.length < 400)
  const o = outline('# T\n\ntexto 1\nmais\n\n## A\n\nlinha A\n```\n# não é título\n```\n## B\nlinha B\n')
  assert.match(o, /^# T\ntexto 1\n## A\nlinha A\n## B\nlinha B/)
  assert.doesNotMatch(o, /não é título/)
  assert.deepEqual(validateConfig({ profile: 'bare', context: { optimize: false } }), [])
  assert.match(validateConfig({ profile: 'bare', context: { optimize: 'sim' } }).join(), /context\.optimize/)
})

test('otimizador: handoff mais recente inteiro, anteriores compactados, economia medida; --full desliga', () => {
  const root = project()
  const pkg = buildContextPackage(root, '13')
  const mod = pkg.sections.find((s) => s.id === 'module')
  assert.ok(mod.compacted && mod.full_tokens > mod.tokens)
  assert.match(mod.content, /anteriores compactados/)
  assert.match(mod.content, /#### Handoff \(task 12 — recente\)\n- Feito: lote paralelo\. Detalhe 0/, 'recente inteiro')
  assert.match(mod.content, /#### Handoff \(task 11 — do meio\)\n- Feito: adicionei o runner\.\n/, 'anterior compactado')
  assert.ok(pkg.saved_tokens > 0 && pkg.full_tokens > pkg.total_tokens)

  const full = buildContextPackage(root, '13', { optimize: false })
  assert.equal(full.saved_tokens, 0)
  assert.equal(full.optimized, false)
  assert.ok(full.total_tokens > pkg.total_tokens)
  assert.equal(buildContextPackage(project({ optimize: false }), '13').optimized, false, 'harness.json context.optimize: false')
})

test('otimizador: seção que não cabe vira resumo antes de ser omitida; digest do módulo entra', () => {
  const root = project({ digest: true })
  const pkg = buildContextPackage(root, '13', { budget: 450 })
  const feat = pkg.sections.find((s) => s.id === 'feature')
  assert.ok(feat, 'spec da feature entra resumida')
  assert.equal(feat.outline, true)
  assert.match(feat.content, /## Problema\nDetalhe 0/)
  assert.ok(feat.tokens < feat.full_tokens)
  assert.ok(pkg.total_tokens <= 450 + pkg.sections.find((s) => s.id === 'task').tokens)
  assert.match(pkg.sections.find((s) => s.id === 'module').content, /Resumo do histórico \(context\/modules\/m1\/digest\.md\)[\s\S]*Prompt sempre pelo stdin/)

  const res = spawnSync(process.execPath, [BIN, 'context', '13', '--stats', '--budget', '450'], { cwd: root, encoding: 'utf8' })
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /otimizador ligado \(-\d+\)/)
  assert.match(res.stdout, /feature +\d+ +\d+ +resumida/)
  assert.match(res.stdout, /module +\d+ +\d+ +compactada/)
  const off = spawnSync(process.execPath, [BIN, 'context', '13', '--stats', '--full'], { cwd: root, encoding: 'utf8' })
  assert.match(off.stdout, /otimizador desligado/)
})
