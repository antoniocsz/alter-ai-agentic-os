# Task: orcamento agregacao e harness budget
## Agente: `backend`
## Módulo: `harness`
## Feature: orcamento-de-custos
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/budget.js`
- `scripts/harness/src/budget.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/budget.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/features/orcamento-de-custos/spec.md · plan.md · scripts/harness/src/lib/runs.js · scripts/harness/src/lib/config.js · scripts/harness/src/lib/dates.js
## Skills a carregar: codegen.md
## O que já existe: tabela `runs` (tokens_in/out, cost_usd, measured, started_at, task_id); `localDate`/`localMonth`; `validateConfig`. NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `lib/budget.js` (NOVO) → `readBudget`, `usageSummary`, `checkBudget`, `effectiveRunLimit`
- `src/budget.js` (NOVO) → `harness budget [--json]`
- `lib/config.js` → validação de `budget`
- `commands/index.js` → registro + ajuda
- `tests/budget.test.js` (NOVO)
## Especificação: ver spec AC-1, AC-2. Tokens = tokens_in + tokens_out (nulos contam 0 só se o outro existir). Só runs `measured = 1` somam; `unmeasured` conta os demais. Dia/mês pela data local do `started_at`.
## Critério de conclusão:
- [ ] Teste: validateConfig aceita/reprova budget (escopo desconhecido, métrica desconhecida, valor ≤ 0)
- [ ] Teste: usageSummary por task/dia/mês, ignora não medidos e os conta
- [ ] Teste: checkBudget → violações e restante; effectiveRunLimit = menor entre run e restante
- [ ] Teste: CLI `harness budget --json` e tabela; sem budget configurado mostra só o consumo
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 106`
## Complexidade: média
