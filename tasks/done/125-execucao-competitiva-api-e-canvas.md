# Task: execucao competitiva api e canvas
## Agente: `frontend`
## Módulo: `harness`
## Feature: execucao-competitiva
## Prioridade: P1
## Tipo: feat
## ACs: AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/lib/canvas.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/competitions-api.test.js`
## Depende de: [ ] `124`
## Contexto para ler: context/features/execucao-competitiva/spec.md · scripts/harness/src/lib/runs-api.js · scripts/harness/src/kanban.js
## Skills a carregar: codegen.md + frontend.md
## O que já existe: motor e CLI da competição (124); API e canvas de runs e fluxos.
## O que criar:
- `lib/runs-api.js` → `/api/competitions` (listar, ver com runs, iniciar em segundo plano, pick, discard); task ocupada recusa run/fluxo/competição
- `lib/canvas.js` → competição mais recente no cartão
- `kanban.js` → "🏁 Competição", tabela de comparação com "Escolher", "Descartar"
- `tests/competitions-api.test.js` (NOVO)
## Especificação: AC-5 da spec.
## Critério de conclusão:
- [x] API: inicia, compara, juiz recomenda, pick aplica; cartão com estado
- [x] Validações, unsafe, discard durante a execução
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 125`
## Complexidade: media

## Baseline (git)
- tasks/queue/125-execucao-competitiva-api-e-canvas.md
