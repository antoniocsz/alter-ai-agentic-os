# Task: analytics de execucoes
## Agente: `backend`
## Módulo: `harness`
## Feature: qualidade-e-analytics
## Prioridade: P1
## Tipo: feat
## ACs: AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/analytics.js`
- `scripts/harness/src/analytics.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/analytics.test.js`
## Depende de: [ ] `128`
## Contexto para ler: context/features/qualidade-e-analytics/spec.md · scripts/harness/src/lib/budget.js (usageSummary)
## Skills a carregar: codegen.md + backend.md
## O que já existe: runs com tokens/custo medidos, runs.quality (128), harness budget.
## O que criar:
- `lib/analytics.js` (NOVO) → agregação por tool/modelo/task/agente/dia, `parseSince`
- `src/analytics.js` (NOVO) → CLI `harness analytics`
- `kanban.js` → `/analytics` (painel) e `/api/analytics`; link na vista Execução
- `commands/index.js` → registro e help
- `tests/analytics.test.js` (NOVO)
## Especificação: AC-4 e AC-5 da spec.
## Critério de conclusão:
- [x] Agregação por todas as dimensões, período, uso não reportado fora das somas
- [x] CLI e --json; painel e API; script do painel compila
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 129`
## Complexidade: media

## Baseline (git)
- tasks/queue/129-analytics-de-execucoes.md
