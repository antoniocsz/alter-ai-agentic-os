# Task: gates pos-run
## Agente: `backend`
## Módulo: `harness`
## Feature: qualidade-e-analytics
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/runs.js`
- `scripts/harness/src/lib/batch.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/lib/flows.js`
- `scripts/harness/src/lib/competitions.js`
- `scripts/harness/src/compete.js`
- `scripts/harness/src/lib/canvas.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/quality.test.js`
- `scripts/harness/tests/runs.test.js`
## Depende de: —
## Contexto para ler: context/features/qualidade-e-analytics/spec.md · plan.md · scripts/harness/src/lib/gates.js
## Skills a carregar: codegen.md + backend.md
## O que já existe: motor de gates (finish/merge), runTool, fluxo, competição, canvas.
## O que criar:
- ver plan.md (gates pós-run em todos os caminhos de execução)
- `tests/quality.test.js` (NOVO); `tests/runs.test.js` → aceita o namespace `quality.`
## Especificação: AC-1 a AC-3 da spec.
## Critério de conclusão:
- [x] runGatesAsync não bloqueia; scripts e nativos
- [x] runTool grava quality.gate + runs.quality; run falho não roda gates
- [x] harness run/--no-gates/harness runs; revisor do fluxo recebe os gates
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 128`
## Complexidade: alta

## Baseline (git)
- context/features/qualidade-e-analytics/plan.md
- context/features/qualidade-e-analytics/spec.md
- tasks/queue/128-gates-pos-run.md
