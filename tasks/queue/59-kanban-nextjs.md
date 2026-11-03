# Task: Kanban Next.js (workspace dashboard)
## Agente: `coordinator` (feature)
## Módulo: `harness`
## Prioridade: P1
## Tipo: feat
## Escopo (arquivos que esta task vai tocar):
- `workspace/kanban/`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/kanban.test.js`
- `README.md`
## Depende de: [ ] 58-p0-workspace-config.md
## Contexto para ler: review v0.3.2; kanban atual (HTML/HTTP)
## O que criar:
- App Next.js em `workspace/kanban` (perfil web) com server components/API routes lendo o workspace registry e os `.harness/harness.db` de cada projeto.
- Board queue/active/done por projeto, agrupamento por módulo, badges de worktree/gates, detalhe da task e timeline.
- Ações (mover/abrir worktree) via API que chama o CLI do harness; sem escrita no browser.
- Manter `harness kanban` como fallback.
## Critério de conclusão:
- [ ] `pnpm dev` sobe o board multi-projeto
- [ ] leitura via SQLite no servidor; nenhuma credencial no cliente
- [ ] ações delegadas ao CLI com validação
- [ ] README documenta
## Complexidade: alta
