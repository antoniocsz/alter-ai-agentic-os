# Task: workspaces para múltiplos projetos + kanban dinâmico com detalhamento
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/bin/harness.js`
- `scripts/harness/src/init.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/workspace.js` (novo)
- `scripts/harness/src/workspace.js` (novo)
- `scripts/harness/templates/workspace/AGENTS.md` (novo)
- `scripts/harness/templates/kanban/board.html`
- `scripts/harness/tests/init.test.js`
- `scripts/harness/tests/workspace.test.js` (novo)
- `scripts/harness/tests/kanban.test.js` (novo)
- `README.md`
- `context/modules/harness/context.md` (novo, dogfood)
- `context/modules/harness/status.md` (novo, dogfood)
## Depende de: [ ] `-`
## Contexto para ler: context/project/* (dogfood)
## Skills a carregar: codegen.md + backend.md
## O que já existe:
- Modelo "1 fonte + N projetos" via `harness init` (cópia da camada) e `harness update --source`
- CLI em `scripts/harness` (bin/harness.js + src/*) com zero deps, Node >= 22.5
- Kanban estático/servidor em src/kanban.js + templates/kanban/board.html
- Banco SQLite (.harness/harness.db) com tasks, task_events, interactions
## O que criar:
- `scripts/harness/src/lib/workspace.js` → findWorkspaceRoot, loadRegistry, saveRegistry, resolveProject
- `scripts/harness/src/workspace.js` → comandos workspace: init, new, add, list/status, check/sync/report/update (--all), run, kanban
- `scripts/harness/templates/workspace/AGENTS.md` → AGENTS.md da raiz do workspace
- `scripts/harness/tests/workspace.test.js` → testes de workspace + isolamento
- `scripts/harness/tests/kanban.test.js` → testes de detalhe/board multi-projeto
## Especificação:
- Registro `.harness-workspace.json`: { version, harnessSource, projectsDir, projects: [{name, path}] } — paths absolutos normalizados
- Isolamento por padrão: comandos rodam no cwd; cruzar exige --project/run explícito
- Validações de isolamento no add e no check: raiz do workspace, duplicado, aninhado
- `--project <nome>` global resolve projeto no registro (discovery sobe de cwd; fallback HARNESS_WORKSPACE)
- Kanban: board data com `project` por card; GET /api/tasks/<id> devolve { task, file, history }; modal de detalhes; filtros, busca, toggles de coluna, refresh
## Critério de conclusão:
- [ ] `pnpm test` passando (todos os testes, incluindo os novos)
- [ ] `pnpm harness check` ok no repo-fonte
- [ ] README.md documentando workspaces
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 08-workspaces-multiprojeto.md`
## Complexidade: alta

## Baseline (git)
- context/agents/queue/08-workspaces-multiprojeto.md
## Baseline (git)
- README.md
- context/agents/queue/08-workspaces-multiprojeto.md
