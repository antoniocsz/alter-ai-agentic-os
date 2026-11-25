# Task: execucao competitiva motor e cli
## Agente: `backend`
## Módulo: `harness`
## Feature: execucao-competitiva
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/competitions.js`
- `scripts/harness/src/compete.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/compete.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-flow-agent.js`
## Depende de: —
## Contexto para ler: context/features/execucao-competitiva/spec.md · plan.md · scripts/harness/src/lib/flows.js
## Skills a carregar: codegen.md + backend.md
## O que já existe: run, lote, fluxo encadeado (worktreeDiff, worktreeSignature), prepareRun compartilhado.
## O que criar:
- `lib/competitions.js` (NOVO) → esquema, worktrees das candidatas, execução em pool, estatísticas, juiz, pick/discard
- `src/compete.js` (NOVO) → CLI `harness compete`
- `run.js` → `prepareRun({ wt })` e papel `judge`
- `lib/db.js` → migração
- `commands/index.js` → registro e help
- `tests/compete.test.js` (NOVO); `fake-flow-agent.js` → juiz e comportamento por modelo
## Especificação: ver spec e plan.
## Critério de conclusão:
- [x] Candidatas em paralelo, comparação, juiz recomenda, pick aplica e limpa
- [x] Candidata com falha, juiz que altera a worktree, discard, validações
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 124`
## Complexidade: alta

## Baseline (git)
- context/features/execucao-competitiva/plan.md
- context/features/execucao-competitiva/spec.md
- tasks/queue/124-execucao-competitiva-motor-e-cli.md
