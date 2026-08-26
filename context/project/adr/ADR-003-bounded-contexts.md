# ADR-003: Bounded Contexts (Módulos)

**Data:** 2025-01-01
**Status:** accepted (revisto para fundação padrão B2B/B2C)

## Contexto

Organizar o domínio em bounded contexts (módulos) que isolem regras de negócio, evitem acoplamento e possam evoluir independentemente. Todo projeto gerado pelo harness nasce com uma fundação padrão (tenancy, auth, authorization, audit) e módulos de negócio criados sob demanda.

## Decisão

Dividir o domínio em módulos, com a fundação padrão:

| Módulo | Responsabilidade | Eventos que publica |
|--------|-----------------|---------------------|
| `@saas/tenancy` | Hierarquia e contexto de tenancy, membresias | `tenant.created`, `membership.changed` |
| `@saas/auth` | Cadastro, login, JWT, refresh token, gestão de perfil | `user.created`, `user.updated` |
| `@saas/authorization` | RBAC/ABAC: roles, permissões, abilities (CASL) | `role.assigned`, `role.removed`, `permission.changed` |
| `@saas/audit` | Trilha de auditoria (append-only) | (consome eventos, não publica) |
| `@saas/analytics` | ETL para ClickHouse, insights, relatórios | `report.generated` |
| `@saas/billing` | Planos, feature flags, Stripe checkout/webhooks | `subscription.changed`, `subscription.canceled` |

Módulos de negócio (products, subscriptions, ...) são adicionados via `pnpm harness module <nome>` conforme o domínio do projeto.

## Consequências positivas

- Cada módulo pode ser testado e implantado independentemente
- Fronteiras claras evitam acoplamento indevido
- Eventos permitem reação sem dependência direta entre módulos
- Fundação padrão reduz o custo de iniciar um novo projeto B2B/B2C

## Trade-offs aceitos

- Comunicação via eventos adiciona latência (vs chamada direta)
- Eventual consistency entre módulos

## Alternativas descartadas

- **Módulo de domínio gigante:** difícil de testar e evoluir
- **CRUD puro sem eventos:** impossível ter audit/analytics reativos sem poluir use-cases
- **Sem fundação padrão:** cada projeto novo recomeça do zero auth/tenancy/audit