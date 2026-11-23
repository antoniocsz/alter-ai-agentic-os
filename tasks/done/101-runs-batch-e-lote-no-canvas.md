# Task: runs batch e lote no canvas
## Agente: `backend`
## Módulo: `harness`
## Feature: orquestracao-paralela
## Prioridade: P2
## Tipo: feat
## ACs: AC-3, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/runs.js`
- `scripts/harness/src/lib/canvas.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/batch-views.test.js`
## Depende de: [ ] `100`
## Contexto para ler: context/features/orquestracao-paralela/spec.md · scripts/harness/src/runs.js · scripts/harness/src/lib/canvas.js (runFor)
## Skills a carregar: codegen.md + ui-ux.md
## O que já existe: `runs.batch_id` e `listRuns({ batchId })` (task 100); `harness runs [<task>]`; bloco `run` no cartão do /canvas (task 95).
## O que criar:
- `src/runs.js` → `harness runs --batch <id> [--json]` (coluna lote na tabela)
- `lib/canvas.js` → `run.batch_id` no cartão
- `kanban.js` → id do lote na linha do run (vista /canvas)
- `tests/batch-views.test.js` (NOVO)
## Especificação: run sem lote → `batch_id: null` e cartão igual ao atual.
## Critério de conclusão:
- [ ] Teste: `runs --batch <id> --json` filtra o lote
- [ ] Teste: /api/canvas e cardHtml mostram o lote (e nada quando null)
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 101`
## Complexidade: baixa
