# Task: seletor de projetos no workspace e no app
## Agente: `frontend`
## Módulo: `harness`
## Feature: projetos-e-inicio
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/projects.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/lib/workspace-page.html`
- `scripts/harness/tests/projects.test.js`
- `apps/desktop/src/preload.cjs`
- `apps/desktop/src/main.js`
- `apps/desktop/src/core.js`
- `apps/desktop/README.md`
- `README.md`
- `context/modules/harness/status.md`
- `context/features/projetos-e-inicio/spec.md`
- `context/features/projetos-e-inicio/plan.md`
## Depende de: [x] `141`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + frontend.md
## O que já existe: app troca de projeto só por Arquivo → Recentes; `lib/workspace.js` lê o registro do workspace.
## O que criar:
- `scripts/harness/src/lib/projects.js` → projetos do workspace com contagem de tasks
- `apps/desktop/src/preload.cjs` → ponte segura para trocar de projeto pela página
## Especificação: ver context/features/projetos-e-inicio/spec.md (AC-1..AC-3) e plan.md.
## Critério de conclusão:
- [ ] seletor no topo do Workspace lista os projetos do workspace e troca no app
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 142-seletor-de-projetos-no-workspace-e-no-app.md`
## Complexidade: média

## Baseline (git)
- apps/desktop/package-lock.json
- context/features/projetos-e-inicio/plan.md
- context/features/projetos-e-inicio/spec.md
- tasks/queue/142-seletor-de-projetos-no-workspace-e-no-app.md
