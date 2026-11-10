# Task: Canvas — vista "Execução" (cartões ao vivo)
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: agent-canvas
## ACs: AC-1, AC-5, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/kanban.test.js`

Anotações do escopo: `kanban.js` para a vista `/canvas` (página, CSS, JS de refresh); testes da vista. Detalhes em "O que criar".
## Depende de: 84-backend-canvas-dados.md
## Contexto para ler: context/modules/harness/context.md · context/features/agent-canvas/spec.md · scripts/harness/src/kanban.js (renderPage/serveBoard) · context/modules/harness/status.md (handoff da 84)
## Skills a carregar: codegen.md
## O que já existe (pós-84):
- `GET /api/canvas` serve `canvasState` (agente, worktree/branch, tempo, diff count, último evento, última nota, staleness)
- Board com drag&drop, modal de detalhamento por card, auto-refresh 3s, WIP limits — tudo em kanban.js
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- Página `/canvas` (mesma instância do servidor): grid de cartões, um por task ativa; link visível a partir do board (e vice-versa)
- Cartão: id/título, agente, worktree/branch (ou "raiz"), tempo em execução, contagem de arquivos alterados, último evento, última nota ("o agente reporta…"), badge + destaque amarelo de staleness
- Clique no cartão → modal de histórico/detalhamento (reuso do modal existente, chamando os mesmos endpoints)
- Auto-refresh 3s (mesma mecânica do board); sem ações de controle (read-only no v1)
## Especificação:
- Cartão vazio na vista quando nenhuma task ativa (mensagem "Nada em execução agora")
- Estética consistente com o board atual (mesmo CSS/tema)
- Regra do canvas: nenhum endpoint de write (v1 read-only)
## Critério de conclusão:
- [ ] Vista `/canvas` renderizada e alimentada por `/api/canvas` (testes da rota/página)
- [ ] Staleness visível (badge/classe), modal funciona
- [ ] Board atual sem regressão (moves/WIP/drag&drop seguem funcionando — AC-7)
- [ ] `node --test` verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 85`
## Complexidade: média
## Baseline (git): main (queue planejada 2026-11-09)
