# Task: tela inicio do workspace (visao do projeto)
## Agente: `frontend`
## Módulo: `harness`
## Feature: projetos-e-inicio
## Prioridade: P1
## Tipo: feat
## ACs: AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/overview.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/lib/workspace-page.html`
- `scripts/harness/tests/overview.test.js`
- `README.md`
- `context/modules/harness/status.md`
- `context/features/projetos-e-inicio/spec.md`
## Depende de: [x] `142`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + frontend.md
## O que já existe: Workspace sem visão do projeto; vazio quando não há task ativa.
## O que criar:
- `scripts/harness/src/lib/overview.js` → visão do projeto (pipeline, fila, concluídas recentes, uso 7d)
- tela Início no Workspace + `POST /api/pipeline/tasks|start`
## Especificação: ver context/features/projetos-e-inicio/spec.md (AC-4, AC-5).
## Critério de conclusão:
- [ ] Início mostra o status do projeto e abre sozinho sem task ativa; criar e iniciar task pela tela
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 143-tela-inicio-do-workspace-visao-do-projeto.md`
## Complexidade: média

## Baseline (git)
- context/features/projetos-e-inicio/spec.md
- apps/desktop/package-lock.json
- tasks/queue/143-tela-inicio-do-workspace-visao-do-projeto.md
