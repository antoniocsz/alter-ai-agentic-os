import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { openDb, syncFromMarkdown, recordInteraction } from '../src/lib/db.js'
import { buildContextPackage, renderContextMarkdown, recentHandoffs, estimateTokens } from '../src/lib/context.js'
import { tmpdir, write, gitInit } from './helpers.js'

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/harness.js')
const FAKE_SK = 'sk-' + 'abcdefghijklmnop1234' // concatenado: não aciona o gate secrets

const STATUS = `# m1 — Status

## Fase 1
- [x] algo

## Handoff (v0.1)
- antigo sem número

## Handoff (task 5 — cinco)
- feito cinco

## Handoff (task 12 — doze)
- feito doze

## Histórico de handoffs
### Lote 1
- velho

## Handoff (task 9 — nove)
- feito nove
`

function fixture({ git = true } = {}) {
  const root = tmpdir()
  write(root, 'AGENTS.md', `# AGENTS.md\n\n## Perfil\nnão entra\n\n## Regras inegociáveis (genéricas)\n- regra A\n\n## Guard Rails — execução somente com consentimento\n- guard B\n\n## Índice\nnão entra\n`)
  write(root, 'README.md', '# readme\n')
  write(root, 'context/features/f1/spec.md', '# Spec: f1\n- [ ] AC-1 — algo\n')
  write(root, 'context/modules/m1/context.md', '# m1 — Contexto\nbounded context m1\n')
  write(root, 'context/modules/m1/status.md', STATUS)
  write(root, '.agents/codegen.md', '# codegen\nregras de código\n')
  write(root, 'context/project/adr/ADR-001-decisao.md', '# ADR-001: decisão X\n')
  write(root, 'tasks/done/01-base.md', '# Task: base\n## Escopo:\n- `src/base.js`\n')
  write(root, 'tasks/active/02-alvo.md', `# Task: alvo
## Agente: \`backend\` | Módulo: \`m1\` | Prioridade: P1 | Tipo: feat
## Feature: f1
## Escopo (arquivos que esta task vai tocar):
- \`src/a.js\`
- \`README.md\`
## Depende de: [ ] \`01\`
## Skills a carregar: codegen.md + inexistente.md
## O que já existe: segue ADR-001; chave de teste ${FAKE_SK}
## Critério de conclusão:
- [ ] ok
`)
  if (git) gitInit(root)
  const db = openDb(root)
  syncFromMarkdown(db, root)
  recordInteraction(db, { taskId: '01-base.md', kind: 'note', content: 'handoff: base pronta, use src/base.js' })
  db.close()
  return root
}

test('buildContextPackage: seções na ordem de prioridade, só com o que existe', () => {
  const pkg = buildContextPackage(fixture(), '02')
  assert.equal(pkg.task, '02-alvo.md')
  assert.equal(pkg.state, 'active')
  assert.equal(pkg.estimated, true)
  assert.deepEqual(pkg.sections.map((s) => s.id), ['task', 'rules', 'feature', 'module', 'deps', 'skills', 'adrs', 'scope', 'history'])
  const by = Object.fromEntries(pkg.sections.map((s) => [s.id, s]))
  assert.match(by.rules.content, /regra A[\s\S]*guard B/)
  assert.ok(!by.rules.content.includes('não entra'))
  assert.match(by.feature.content, /# Spec: f1/)
  assert.match(by.module.content, /bounded context m1/)
  assert.match(by.deps.content, /\*\*01-base\.md\*\* — base pronta, use src\/base\.js/)
  assert.match(by.skills.content, /### \.agents\/codegen\.md/)
  assert.ok(!by.skills.content.includes('inexistente'))
  assert.match(by.adrs.content, /ADR-001-decisao\.md/)
  assert.match(by.scope.content, /`src\/a\.js` — não existe \(será criado\)/)
  assert.match(by.scope.content, /`README\.md` — \d+ bytes · último commit: \w+ .* base/)
  assert.match(by.history.content, /^- \w+ \d{4}-\d{2}-\d{2} base$/m)
  assert.equal(pkg.total_tokens, pkg.sections.reduce((a, s) => a + s.tokens, 0))
  assert.ok(pkg.sections.every((s) => s.tokens === estimateTokens(s.content)))
})

test('módulo: só os 3 handoffs mais recentes (maior número de task; sem número = mais antigo)', () => {
  assert.deepEqual(recentHandoffs(STATUS).map((h) => h.heading), ['Handoff (task 12 — doze)', 'Handoff (task 9 — nove)', 'Handoff (task 5 — cinco)'])
  const mod = buildContextPackage(fixture(), '02').sections.find((s) => s.id === 'module').content
  assert.match(mod, /feito doze[\s\S]*feito nove[\s\S]*feito cinco/)
  assert.ok(!mod.includes('antigo sem número'))
  assert.ok(!mod.includes('Lote 1'))
})

test('--budget: seção que não cabe sai inteira, a task nunca sai, omitidas listadas', () => {
  const root = fixture()
  const full = buildContextPackage(root, '02')
  const taskTokens = full.sections.find((s) => s.id === 'task').tokens
  const tiny = buildContextPackage(root, '02', { budget: 1 })
  assert.deepEqual(tiny.sections.map((s) => s.id), ['task'], 'só a task, mesmo acima do orçamento')
  assert.equal(tiny.total_tokens, taskTokens)
  assert.equal(tiny.omitted.length, full.sections.length - 1)
  assert.ok(tiny.omitted.every((o) => /não cabe no orçamento/.test(o.reason)))

  const rules = full.sections.find((s) => s.id === 'rules').tokens
  const mid = buildContextPackage(root, '02', { budget: taskTokens + rules })
  assert.deepEqual(mid.sections.slice(0, 2).map((s) => s.id), ['task', 'rules'])
  assert.ok(mid.total_tokens <= taskTokens + rules)
  assert.match(renderContextMarkdown(mid), /> Omitidas por orçamento: /)
})

test('redaction e degradação: segredo mascarado; sem git as seções de git somem', () => {
  const pkg = buildContextPackage(fixture({ git: false }), '02')
  const ids = pkg.sections.map((s) => s.id)
  assert.ok(!ids.includes('history'))
  assert.ok(!pkg.sections.find((s) => s.id === 'scope').content.includes('último commit'))
  const md = renderContextMarkdown(pkg)
  assert.ok(!md.includes(FAKE_SK), 'segredo não pode sair no pacote')
  assert.match(md, /\[REDACTED\]/)
  assert.throws(() => buildContextPackage(fixture(), '99'), /task não encontrada/)
})

test('CLI: harness context --json, --out e validação do --budget', () => {
  const root = fixture()
  const cli = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, encoding: 'utf8' })
  const json = cli(['context', '02', '--json'])
  assert.equal(json.status, 0, json.stderr)
  assert.equal(JSON.parse(json.stdout).sections[0].id, 'task')

  const out = cli(['context', '02', '--budget', '100000', '--out', 'tmp/pacote.md'])
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /📦 pacote de 02-alvo\.md → tmp[\\/]pacote\.md · 9 seção\(ões\) · ~\d+ tokens \(estimado\)/)
  const md = fs.readFileSync(path.join(root, 'tmp', 'pacote.md'), 'utf8')
  assert.match(md, /^# Pacote de contexto — 02-alvo\.md/)
  assert.match(md, /## \[deps\] Dependências/)

  assert.notEqual(cli(['context', '02', '--budget', '0']).status, 0)
  assert.notEqual(cli(['context', '02', '--budget']).status, 0)
  assert.match(cli(['context', 'done-nao']).stderr, /task não encontrada/)
  assert.equal(JSON.parse(cli(['context', '01', '--json']).stdout).state, 'done', 'task em done/ também gera pacote')
})
