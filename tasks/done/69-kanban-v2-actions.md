# Task: Kanban v2 — ações via CLI
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Escopo:
- `workspace/kanban/`
## Depende de: [x] 68-adapter-layer.md
## O que criar:
- Server actions para mover cards (start/finish/requeue/reopen) e abrir worktree, chamando o CLI no servidor.
- Feedback por query string; validação de id/projeto/ação.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes

## Baseline (git)
- tasks/queue/69-kanban-v2-actions.md
