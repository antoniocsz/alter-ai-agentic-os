# Task: Módulo tenancy (fundação @saas/tenancy)
## Agente: `agente-backend`
## Módulo: `packages/modules/tenancy`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/tenancy/**`
- `context/modules/tenancy/context.md`
- `context/modules/tenancy/status.md`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/tenancy/context.md
## Skills a carregar: codegen.md + backend.md + architecture.md
## O que já existe: definição do módulo em context/modules/tenancy/ (sem código)
## O que criar:
- `harness module tenancy` → scaffold da árvore do módulo
- Entidades Tenant e TenantMembership
- Interfaces ITenantRepository e ITenantMembershipRepository
- Use cases: ResolveTenantContext, ListMemberships, AssertTenantAccess
- Implementações Prisma + middleware de tenancy (Fastify hook injetando tenantId)
## Especificação:
- Toda entidade tenant-scoped tem `tenantId`; middleware garante o contexto do request
- `AssertTenantAccessUseCase` rejeita acesso cross-tenant (ForbiddenError)
- `membership.changed` publicado via EventBus para invalidar cache de abilities
- Barrel `src/index.ts` exporta só o público
## Critério de conclusão:
- [ ] `harness module tenancy` executado e árvore criada
- [ ] Entidades com invariantes e factory methods
- [ ] Use cases completos com DIP (interfaces)
- [ ] Teste de integração: "tenant A não vê dado de tenant B"
- [ ] Barrel export atualizado
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/tenancy`
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 01` e registrar handoff
## Complexidade: alta