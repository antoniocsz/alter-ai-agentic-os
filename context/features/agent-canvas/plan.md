# Plano: agent-canvas

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-09.

## Abordagem

- Reuso máximo do que o kanban já faz: `serveBoard` (HTTP), `buildBoard` (estado), modais de detalhe, auto-refresh.
- Nova coleta de execução em `scripts/harness/src/lib/canvas.js` (novo): junta tasks ativas (fonte markdown via lib/tasks.js), eventos + interações (lib/db.js), worktrees (lib/worktree.js + `git worktree list`) e diff count (`git -C <worktree> status --porcelain` via lib/git.js).
- `kanban.js` monta a rota `GET /api/canvas` (dados) e a página `/canvas` (HTML renderizado server-side, mesmo padrão do board).
- Staleness calculado no servidor (comparação timestamps), não no cliente.

## Módulos e arquivos afetados

- `scripts/harness/src/lib/canvas.js` — novo (coleção de estado de execução)
- `scripts/harness/src/kanban.js` — rotas `/api/canvas` e `/canvas` + CSS/JS da vista
- `scripts/harness/src/lib/git.js` — helper de status por worktree (se não existir helper adequado)
- `scripts/harness/tests/canvas.test.js` — novo (coleção) e `tests/kanban.test.js` (rotas)

## Ordem de tasks

1. `84-backend-canvas-dados.md` — coleção + endpoint JSON. depende de: —
2. `85-backend-canvas-ui.md` — vista Execução (cartões, staleness, modal, refresh). depende de: 1

**Nota de sequenciamento:** ambas tocam `kanban.js`; rodam em lotes distintos (85 só depois de 84 concluída).

## Riscos

- `git status` lento em worktree grande → coleta cobre apenas worktrees com task ativa; sem subshell recursivo; timeout defensivo no spawn do git (ignora erro e mostra "n/d").
- Flake de IPC em `node --test` (histórico: task 15) → testes ruidosos envolvidos com `withSilentStdout`.
- Tabela de eventos vem do banco regenerável (`sync`) → coleta falha graciosamente quando db vazio (usa só markdown + git).
