# @saas/tenancy — Status

## Fase 1 — Fundação
- [ ] Domain entities (Tenant, TenantMembership)
- [ ] Repository interfaces (ITenantRepository, ITenantMembershipRepository)
- [ ] Use cases (ResolveTenantContext, ListMemberships, AssertTenantAccess)
- [ ] Prisma repository implementations
- [ ] Middleware de tenancy (Fastify hook + injeção de tenantId)
- [ ] Testes unitários
- [ ] Testes de integração (isolamento entre tenants)

## Fase 2 — Refinamentos
- [ ] Event subscriber de `membership.changed` invalidando cache de abilities
- [ ] Seletor de tenant no frontend/mobile consumindo `ListMembershipsUseCase`
- [ ] Typecheck: [ ]

## Handoff
- [ ] Preenchido ao finalizar cada task: feito / pendências / decisões