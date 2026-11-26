# Plano: workspace-app

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-26.

## Abordagem

- `lib/workspace-page.js` + `lib/workspace-page.html` (NOVOS): página estática com JS do cliente;
  dados só pela API local; nada de dependência nova.
- `lib/changes.js` (NOVO): `taskChanges` (merge-base com a base, `git diff --numstat`, não rastreados)
  e `filePatch`.
- `lib/runs-api.js`: `GET /api/changes`, `note` no `POST /api/runs`. `runtimes.js`: `supports_resume`.
- `kanban.js`: rota `/workspace`. `apps/desktop/src/main.js`: abre no Workspace, menus.

## Módulos e arquivos afetados

- novos: `lib/workspace-page.js`, `lib/workspace-page.html`, `lib/changes.js`, `tests/workspace-page.test.js`
- `lib/runs-api.js`, `runtimes.js`, `kanban.js`, `apps/desktop/src/main.js`, `apps/desktop/README.md`, `README.md`, `AGENTS.md`

## Ordem de tasks

1. `140` — Workspace (página, mudanças, note, app). depende de: 139

## Riscos

- Página grande sem framework → JS do cliente compilado no teste e verificado com navegador headless.
