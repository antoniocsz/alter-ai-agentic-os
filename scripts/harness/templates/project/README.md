# {{NAME}}

Projeto inicializado com o harness.

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **Backend:** Fastify + Prisma + PostgreSQL + Redis (`apps/api`)
- **Frontend:** Next.js + TanStack Query (`apps/web`)
- **Compartilhado:** `packages/contracts` (tipos/eventos) e `packages/api-client` (http client)
- **Testes:** Vitest (`pnpm test`)
- **Banco de tasks:** `.harness/harness.db` (SQLite, gitignored)

## Rodar

```bash
pnpm install
docker compose up -d        # se criado com --prisma
pnpm db:deploy              # aplica migrations
pnpm dev
```

Testes: `pnpm test` · Typecheck: `pnpm typecheck` · Lint + formatação: `pnpm lint`

## Harness

```bash
pnpm harness task "<descrição>" --module <nome> --scope "p1,p2"   # planejar task
pnpm harness start <task>                                          # iniciar (valida escopo)
pnpm harness finish <task>                                         # finalizar (valida git diff)
pnpm harness check                                                 # validar estado
pnpm harness kanban --serve                                        # painel visual
pnpm harness module <nome>                                         # criar módulo
```

## Contexto

- `context/overview.md` + `context/stack.md` — visão e stack
- `context/modules/<módulo>/` — contexto e status de cada módulo
- `context/agents/queue|active|done/` — pipeline de tasks
- `context/adr/` — decisões arquiteturais
