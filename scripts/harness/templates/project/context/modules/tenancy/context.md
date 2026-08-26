# @saas/tenancy — Contexto do Módulo

## Responsabilidade
Resolução e contexto de tenancy: identificar o tenant ativo de cada request, fornecer o `tenantId` a toda query tenant-scoped e servir a base para o cache de abilities (RBAC/ABAC).

Hierarquia:
```
Platform (você)
  └─ Organization (empresa que contrata)
       └─ ClientAccount (cliente final)
```

## Entidades
- **Tenant** — id, name, status, createdAt, updatedAt
- **TenantMembership** — tenantId, userId, role (org-owner | org-member | client-user), status

## Use Cases
- `ResolveTenantContextUseCase` — a partir do header `X-Tenant-Id` + JWT, monta o contexto de tenancy injetado no request
- `ListMembershipsUseCase` — membros de um tenant (para seletor de tenant no app/mobile)
- `AssertTenantAccessUseCase` — garante que o usuário pertence ao tenant antes de qualquer operação

## Eventos que Publica
- `tenant.created`, `membership.changed` (added/removed/role)

## Eventos que Consome
- `user.created` (@saas/auth) — para rastrear vínculo quando aplicável

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)

## Repositórios
- `ITenantRepository` — interface para persistência de tenants
- `ITenantMembershipRepository` — interface para membresias

## Papel no middleware
- Interceptor/injetor de `tenantId` (Fastify hook + Prisma middleware) resolve o tenant ativo
- Invalida cache de abilities em `membership.changed`