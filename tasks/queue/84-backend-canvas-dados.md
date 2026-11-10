# Task: Canvas — coleção de estado de execução + endpoint
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: agent-canvas
## ACs: AC-2, AC-3, AC-4, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/canvas.js` (NOVO)
- `scripts/harness/src/kanban.js` (apenas rota `GET /api/canvas`; a vista de UI é a task 85)
- `scripts/harness/tests/canvas.test.js` (NOVO)
## Depende de: —
## Contexto para ler: context/modules/harness/context.md · context/features/agent-canvas/spec.md · scripts/harness/src/kanban.js · scripts/harness/src/lib/db.js
## Skills a carregar: codegen.md
## O que já existe:
- `kanban.js`: `serveBoard` (HTTP), `buildBoard`, `projectRoot`; JSON do board servido no modo --serve (auto-refresh 3s já existe)
- `lib/db.js`: queries de tasks/task_events/interactions (testes existem em tests/)
- `lib/worktree.js` + `lib/git.js`: worktrees por task, git status helpers
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `scripts/harness/src/lib/canvas.js` → `canvasState(ctx)`: para cada task em execução (active no markdown/db): agente (do corpo da task), worktree + branch (ou "raiz"), tempo desde `started`, contagem de arquivos alterados (`git -C <worktree> status --porcelain`, com timeout defensivo e fallback "n/d"), último `task_event`, última interação `note` (redigida), staleness (sem atividade > 15 min)
- `kanban.js` → rota `GET /api/canvas` (mesmo servidor, bind 127.0.0.1 inalterado) devolvendo `canvasState`
## Especificação:
- Worktree desconhecida / db vazio → degradação graciosa (usa só markdown + git; campos "n/d")
- Staleness calculado no servidor; payload inclui os dados pré-computados p/ UI não recomputar
- Esta task NÃO constrói a vista (cartões) — é a task 85
## Critério de conclusão:
- [ ] Testes de `canvasState`: task sem worktree, com worktree, sem db (fallback), staleness threshold
- [ ] Testes de rota: JSON com tasks ativas representadas; vazio quando nenhuma
- [ ] `node --test` verdes; `harness check` ok
- [ ] `pnpm test` (suíte full) passando
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 84`
## Complexidade: média
## Baseline (git): main (queue planejada 2026-11-09)
