# Task: coordenador de tarefas
## Agente: `backend`
## Módulo: `harness`
## Feature: coordenador-de-tarefas
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/coordinator.js`
- `scripts/harness/src/lib/plans-schema.js`
- `scripts/harness/src/coordinate.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/coordinator.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-flow-agent.js`
## Depende de: —
## Contexto para ler: context/features/coordenador-de-tarefas/spec.md · plan.md · scripts/harness/src/task.js (createTaskFile)
## Skills a carregar: codegen.md + backend.md + orchestration.md
## O que já existe: createTaskFile, DoR, lote, fluxo, prepareRun/runTool.
## O que criar:
- ver plan.md
## Especificação: ver spec.
## Critério de conclusão:
- [x] Validação unitária (escopo, ciclos, ACs, ondas)
- [x] CLI ponta a ponta: plano → edição → aprovação → next com fluxo → status → onda seguinte
- [x] Guardas do coordenador
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 137`
## Complexidade: alta

## Baseline (git)
- context/features/coordenador-de-tarefas/plan.md
- context/features/coordenador-de-tarefas/spec.md
- tasks/queue/137-coordenador-de-tarefas.md
