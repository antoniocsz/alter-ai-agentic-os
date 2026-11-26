# Plano: projetos-e-inicio

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-26.

## Abordagem

- `lib/projects.js` (NOVO): `listProjects` sobre `lib/workspace.js`; rota `GET /api/projects` em `kanban.js`.
- `apps/desktop/src/preload.cjs` (NOVO) + `ipcMain` em `main.js` (origem do serve) + `validProjectRequest` em `core.js`.
- `lib/workspace-page.html`: seletor de projetos (142) e tela Início (143).

## Módulos e arquivos afetados

- 142: `lib/projects.js`, `kanban.js`, `lib/workspace-page.html`, `apps/desktop/src/{preload.cjs,main.js,core.js}`, `tests/projects.test.js`, READMEs
- 143: `lib/workspace-page.html`, API de início, testes, README

## Ordem de tasks

1. `142` — seletor de projetos. depende de: 141
2. `143` — tela Início. depende de: 142

## Riscos

- Ponte do Electron exposta à página → só a origem do serve aberto e só pasta de projeto.
