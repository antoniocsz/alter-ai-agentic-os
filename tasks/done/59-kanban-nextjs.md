# Task: Kanban Next.js (workspace dashboard)
## Agente: `coordinator` (feature)
## Módulo: `harness`
## Prioridade: P1
## Tipo: feat
## Escopo (arquivos que esta task vai tocar):
- `workspace/kanban/`
- `scripts/harness/src/kanban.js`
- `README.md`
## Depende de: [x] 58-p0-workspace-config.md
## Contexto para ler: kanban atual (HTML/HTTP), review v0.3.2
## O que criar (v1):
- App Next.js em `workspace/kanban` lendo o registry do workspace e os markdown de tasks de cada projeto (server-side).
- Board multi-projeto queue/active/done com prioridade, módulo, feature, worktree e escopo.
- `GET /api/board` para consumo externo.
- Ações (mover/worktree) ficam para a v2 via API chamando o CLI; v1 é read-only.
## Critério de conclusão:
- [x] board renderiza os projetos do workspace
- [x] `next build` compila
- [x] README do app documenta `pnpm dev`, `HARNESS_WORKSPACE` e o escopo read-only
## Complexidade: alta

## Baseline (git)
- tasks/queue/59-kanban-nextjs.md
