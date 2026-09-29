# Task: evolução do harness — lote B1+B2+B3+C1+A1
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/bin/harness.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/lib/workspace.js`
- `scripts/harness/src/lib/metrics.js` (computeMetrics sincroniza do markdown)
- `scripts/harness/templates/kanban/board.html`
- `context/project/adr/ADR-004-copy-per-project.md` (novo)
- `context/project/adr/ADR-005-workspaces.md` (novo)
- `scripts/harness/tests/workspace.test.js`
- `scripts/harness/tests/kanban.test.js`
- `README.md`
## Depende de: [ ] `-`
## Contexto para ler: context/project/adr/ADR-001 (formato ADR) + context/modules/harness/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: workspace CLI (init/new/add/list/status/check/sync/report/update/run/kanban), kanban agregado com detalhes, isolamento validado
## O que implementar:
- B1 — `harness workspace task <projeto> "<desc>" [flags]` cria task direto no projeto certo (reusa task.js após chdir)
- B2 — `harness workspace report --all --format json` agrega métricas de todos os projetos num JSON único (computeMetrics direto)
- B3 — `harness check` executado na raiz do workspace valida isolamento do registro automaticamente (sem --all); isolar isolationErrors em lib/workspace.js para reuso
- C1 — ADR-004 (copy-per-project) e ADR-005 (workspaces)
- A1 — WIP limits no kanban: config `.harness/kanban.json` (`{"wip":{"active":N,"queue":N}}`), enforcement no move (400), badges no header das colunas, função pura wipViolation testável
## Critério de conclusão:
- [ ] `harness workspace task <p> "<desc>"` cria task no projeto certo (teste spawn)
- [ ] `harness workspace report --all --format json` → JSON único com todos os projetos (teste)
- [ ] `harness check` na raiz do workspace valida isolamento (teste spawn: registro corrompido → exit != 0)
- [ ] ADR-004 e ADR-005 escritos no formato dos ADRs existentes
- [ ] WIP: move bloqueado com 400 ao atingir o limite; badge no header (testes de função pura + servidor)
- [ ] `pnpm test` passando
- [ ] `pnpm harness check` ok
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 11-evolucao-harness-lote.md`
## Complexidade: média

## Baseline (git)
- context/agents/queue/11-evolucao-harness-lote.md
## Baseline (git)
- context/agents/active/02-api-routes-auth.md
- context/agents/done/01-prisma-repositories.md
- context/agents/queue/03-module-tenancy.md
- context/agents/queue/04-module-authorization.md
- context/agents/queue/05-module-audit.md
- context/agents/queue/06-module-analytics.md
- context/modules/analytics/context.md
- context/modules/analytics/status.md
- context/modules/audit/context.md
- context/modules/audit/status.md
- context/modules/auth/context.md
- context/modules/auth/status.md
- context/modules/authorization/context.md
- context/modules/authorization/status.md
- context/modules/harness/status.md
- context/modules/tenancy/context.md
- context/modules/tenancy/status.md
- context/project/overview.md
- context/project/stack.md
- context/agents/done/10-limpar-dogfood.md
- context/agents/queue/11-evolucao-harness-lote.md
