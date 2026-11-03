# Task: limpar dogfood — remover exemplo do template e alinhar identidade do repo-fonte
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `context/agents/queue/03-module-tenancy.md` (remover)
- `context/agents/queue/04-module-authorization.md` (remover)
- `context/agents/queue/05-module-audit.md` (remover)
- `context/agents/queue/06-module-analytics.md` (remover)
- `context/agents/active/02-api-routes-auth.md` (remover)
- `context/agents/done/01-prisma-repositories.md` (remover)
- `context/modules/tenancy/` (remover)
- `context/modules/auth/` (remover)
- `context/modules/authorization/` (remover)
- `context/modules/audit/` (remover)
- `context/modules/analytics/` (remover)
- `context/project/overview.md` (reescrever — identidade do harness, não do projeto gerado)
- `context/project/stack.md` (reescrever — stack real deste repo)
## Depende de: [ ] `-`
## Contexto para ler: context/project/overview.md (estado atual)
## Skills a carregar: codegen.md + backend.md
## O que já existe: dogfood do repo-fonte contém o template do `harness init` (tasks de scaffold de módulos tenancy/auth/authorization/audit/analytics, módulos descritivos do projeto gerado, overview/stack do SaaS fictício)
## O que fazer:
- Remover tasks de exemplo do template (queue 03–06, active 02, done 01) — nunca foram trabalho real deste repo
- Remover módulos padrão do template (tenancy, auth, authorization, audit, analytics) — descrevem o projeto gerado, não este repo
- Reescrever `context/project/overview.md` e `stack.md` com a identidade real do repo-fonte (CLI Node zero-deps, pipeline, workspaces, kanban)
- Manter `context/project/adr/` (decisões do template — referência do que o harness gera), `context/modules/harness/` e done/ 07, 08, 09 (histórico real)
- Rodar `harness sync` ao final para remover órfãos do banco (tasks 01–06)
## Critério de conclusão:
- [ ] queue e active vazios; done contém apenas 07, 08, 09
- [ ] módulos restantes: apenas `harness`
- [ ] overview.md/stack.md descrevem o harness (CLI zero-deps, node:sqlite, node:test, workspaces)
- [ ] `pnpm harness check` ok (sem drift, sem órfãos)
- [ ] `pnpm harness check --db` ok
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 10-limpar-dogfood.md`
## Complexidade: baixa

## Baseline (git)
- context/agents/queue/10-limpar-dogfood.md
## Baseline (git)
- context/agents/queue/10-limpar-dogfood.md
