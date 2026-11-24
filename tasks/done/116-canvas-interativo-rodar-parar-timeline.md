# Task: canvas interativo rodar parar timeline
## Agente: `frontend`
## Módulo: `harness`
## Feature: api-local
## Prioridade: P1
## Tipo: feat
## ACs: AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/runs-api.test.js`
## Depende de: [ ] `115`
## Contexto para ler: context/features/api-local/spec.md · scripts/harness/src/kanban.js (renderCanvasPage) · scripts/harness/src/lib/runs-api.js
## Skills a carregar: codegen.md + frontend.md
## O que já existe: API local (task 115) no `harness serve`; `/canvas` só leitura com o run mais recente por cartão.
## O que criar:
- `kanban.js` → `renderCanvasPage(title, { control })`: token da sessão injetado só no serve; por cartão ▶ Rodar (form: tool instalada, modelo, permission mode, unsafe, ignorar orçamento) / ■ Parar / timeline; modal com timeline ao vivo (polling por `after`) e lista de execuções da task
- `tests/runs-api.test.js` → canvas do serve com controles; `kanban --serve` sem token
## Especificação: AC-6 da spec.
## Critério de conclusão:
- [x] `/canvas` do serve traz o token e os controles; `kanban --serve` não traz token nem controles
- [x] Teste de ponta a ponta: cartão → POST com o token da página → run concluído
- [x] Suítes kanban/canvas/serve verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 116`
## Complexidade: media

## Baseline (git)
- tasks/queue/116-canvas-interativo-rodar-parar-timeline.md
