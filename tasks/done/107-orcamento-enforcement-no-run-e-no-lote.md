# Task: orcamento enforcement no run e no lote
## Agente: `backend`
## Módulo: `harness`
## Feature: orcamento-de-custos
## Prioridade: P1
## Tipo: feat
## ACs: AC-3, AC-4, AC-5, AC-6, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/batch.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runtimes/claude.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/run-budget.test.js`
## Depende de: [ ] `106`
## Contexto para ler: context/features/orcamento-de-custos/spec.md · plan.md · scripts/harness/src/lib/budget.js (task 106) · scripts/harness/src/lib/runner.js · scripts/harness/src/lib/batch.js · scripts/harness/src/lib/runtimes/claude.js
## Skills a carregar: codegen.md + security.md
## O que já existe: `checkBudget`/`effectiveRunLimit` (106); runner com `meta.usage` (Claude só no `result`; Codex por turno; OpenCode por passo); `killTree`. NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `run.js` → checagem prévia (run e lote), `--ignore-budget`, limite efetivo para o runner
- `runner.js` → `limit` { tokens, usd }: uso parcial acima do limite → killTree, `failed` motivo `budget`, evento `run.failed`
- `batch.js` → checagem antes de cada job (`skipped`, `budget`)
- `runs.js`/`db.js` → coluna `budget_override` (migração) + `startRun({ budgetOverride })`
- `claude.js` → uso parcial de `assistant.message.usage` deduplicado por `message.id`; `result` prevalece
- `tests/run-budget.test.js` (NOVO)
## Especificação: ver spec AC-3..AC-6.
## Critério de conclusão:
- [ ] Teste: recusa prévia (task/dia/mês) e `--ignore-budget` gravado
- [ ] Teste: corte durante o run (runtime falso que reporta uso por passo)
- [ ] Teste: lote pula task quando o orçamento acaba
- [ ] Teste: Claude parcial sem dupla contagem; total do result prevalece
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 107`
## Complexidade: alta
