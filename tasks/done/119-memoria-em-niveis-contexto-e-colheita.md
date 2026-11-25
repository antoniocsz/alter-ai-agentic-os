# Task: memoria em niveis contexto e colheita
## Agente: `backend`
## Módulo: `harness`
## Feature: memoria-em-niveis
## Prioridade: P1
## Tipo: feat
## ACs: AC-6, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/context.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/lib/memories.js`
- `scripts/harness/tests/memory-run.test.js`
- `scripts/harness/tests/fixtures/runtimes/claude-memory.jsonl`
## Depende de: [ ] `118`
## Contexto para ler: context/features/memoria-em-niveis/spec.md · scripts/harness/src/lib/memories.js · scripts/harness/src/lib/context.js
## Skills a carregar: codegen.md + backend.md
## O que já existe: núcleo da memória (task 118): níveis, ranking `rankForTask`, `selectWithinBudget`, `touchMemories`, global.
## O que criar:
- `lib/context.js` → seção `memory` (ativas relevantes, orçamento `memory.budget`, global com `memory.global`; acesso registrado só no run)
- `lib/memories.js` → `parseMemoryBlock`, `harvestRunMemories`; consulta da task só com termos significativos
- `lib/runner.js` → colheita ao fim de run concluído (CLI, lote e API)
- `run.js` → prompt pede bloco `MEMÓRIA:`; aviso de memórias propostas
- `tests/memory-run.test.js` (NOVO) + fixture `claude-memory.jsonl`
## Especificação: AC-6 e AC-7 da spec.
## Critério de conclusão:
- [x] Seção memory só com ativas relevantes; propostas fora; budget 0 desliga; global só autorizado
- [x] Run com bloco MEMÓRIA: → propostas com origem no run; dedupe; run com falha não colhe
- [x] Suítes de run e contexto verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 119`
## Complexidade: media

## Baseline (git)
- tasks/queue/119-memoria-em-niveis-contexto-e-colheita.md
