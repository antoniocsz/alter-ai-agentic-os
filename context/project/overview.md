# AlterAI - Agentic OS — Gerador de Projetos B2B/B2C

## Problema

Todo sistema B2B/B2C recomeça do zero na parte "chata": autenticação, autorização, tenancy multi-tenant e auditoria. Sem isso, cada projeto novo gasta semanas reimplementando a fundação.

## Produto

O AlterAI - Agentic OS é um conjunto de convenções + CLI que gera a estrutura de um projeto full-stack com a fundação padrão já planejada:

- **Monorepo** (Turborepo + pnpm): apps/api (Fastify), apps/web (Next.js), packages (contracts, api-client, modules)
- **Módulos padrão** com contexto e fila de tasks prontas:
  - `tenancy` — hierarquia Platform → Organization → ClientAccount, middleware de tenantId
  - `auth` — register/login, JWT (15min) + refresh (7d rotation), perfil
  - `authorization` — RBAC/ABAC (roles, modules, permissions, abilities CASL)
  - `audit` — trilha append-only com retenção LGPD (5 anos)
- **Pipeline de tasks** (queue → active → done) com validação de escopo, banco SQLite e kanban
- **Agentes do opencode** prontos (coordinator, backend, frontend, mobile, reviewer)

## Público

Projetos B2B/B2C multi-tenant. Papéis base: platform-admin, org-owner, org-member, client-user. Módulos de negócio são adicionados conforme o domínio via `pnpm harness module <nome>`.

## Stack

Monorepo Turborepo | Fastify + Prisma + PostgreSQL + Redis | Next.js 16 | TanStack Query | Zod | Vitest | ESLint (formatador via @stylistic) | CASL | Stripe

## Princípios

- Tenancy multi-tenant como fundação (tenantId em toda query)
- RBAC baseline + ABAC conditions (`@saas/authorization`)
- MVVM estrito no frontend e mobile
- Comunicação entre módulos via eventos (`@saas/contracts`)
- Dependency Inversion — use cases dependem de interfaces
- Audit por padrão (append-only, fora do request path)