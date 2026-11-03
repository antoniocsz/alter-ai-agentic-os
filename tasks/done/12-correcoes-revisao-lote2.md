# Task: correções da revisão do lote 2 (P1–P3)
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/lib/metrics.js`
- `context/modules/harness/status.md`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/harness/status.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: lote 2 concluído (task 11) — revisado e aprovado com 3 pendências menores
## O que corrigir:
- P1 — `reportWorkspace` (json) abre `openDb(p.path)` sem usar (computeMetrics abre a própria) → remover o openDb externo e o import
- P2 — `computeMetrics` não fecha a conexão do banco → envolver o corpo em try/finally com `db.close()`
- P3 — bloco `## Handoff` do `context/modules/harness/status.md` ainda descreve o lote 1 → renovar com lote 2 (tasks 10/11/12)
## Critério de conclusão:
- [ ] Sem openDb morto em reportWorkspace
- [ ] computeMetrics fecha o banco (try/finally)
- [ ] Handoff do status.md reflete o lote 2
- [ ] `pnpm test` passando (67+)
- [ ] `pnpm harness check` ok
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 12-correcoes-revisao-lote2.md`
## Complexidade: baixa

## Baseline (git)
- context/agents/queue/12-correcoes-revisao-lote2.md
## Baseline (git)
- README.md
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
- scripts/harness/src/check.js
- scripts/harness/src/kanban.js
- scripts/harness/src/lib/metrics.js
- scripts/harness/src/lib/workspace.js
- scripts/harness/src/workspace.js
- scripts/harness/templates/kanban/board.html
- scripts/harness/tests/kanban.test.js
- scripts/harness/tests/workspace.test.js
- context/agents/done/10-limpar-dogfood.md
- context/agents/done/11-evolucao-harness-lote.md
- context/agents/queue/12-correcoes-revisao-lote2.md
- context/project/adr/ADR-004-copy-per-project.md
- context/project/adr/ADR-005-workspaces.md
