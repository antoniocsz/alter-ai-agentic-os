# Task: api local de execucoes
## Agente: `backend`
## Módulo: `harness`
## Feature: api-local
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/run.js`
- `scripts/harness/src/runtimes.js`
- `scripts/harness/src/serve.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/tests/runs-api.test.js`
## Depende de: —
## Contexto para ler: context/features/api-local/spec.md · context/features/api-local/plan.md · scripts/harness/src/serve.js · scripts/harness/src/run.js
## Skills a carregar: codegen.md + backend.md
## O que já existe: `harness serve` (kanban + rotinas + webhook) com guard de origem nos POSTs; `harness run` com validações, orçamento, contexto e `runTool`; `stopRun`; `harness runtimes`.
## O que criar:
- `lib/runs-api.js` (NOVO) → createRunsApi: runtimes/list/get/dispatch/stop
- `run.js` → `prepareRun` extraído do runCmd
- `runner.js` → `runTool({ runId })`
- `runtimes.js` → `detectRuntimes`
- `serve.js` → token de sessão, `.harness/serve.json`, `--allow-unsafe`
- `kanban.js` → rotas /api/runtimes e /api/runs* com guards
- `tests/runs-api.test.js` (NOVO)
## Especificação: ver spec (Comportamento esperado) e plan.
## Critério de conclusão:
- [x] Teste HTTP: dispatch com runtime falso → 202, run completed, eventos por `after`
- [x] Teste: stop de run em andamento → failed/interrupted
- [x] Teste: 401/403/409 e unsafe sem --allow-unsafe
- [x] Teste: serve.json criado e removido
- [x] Suítes run/serve/kanban verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 115`
## Complexidade: alta

## Baseline (git)
- context/features/api-local/plan.md
- context/features/api-local/spec.md
- tasks/queue/115-api-local-de-execucoes.md
