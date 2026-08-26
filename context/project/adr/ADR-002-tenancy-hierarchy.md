# ADR-002: Hierarquia de Tenancy — Platform → Organization → ClientAccount

**Data:** 2025-01-01
**Status:** accepted (revisto para SaaS B2B/B2C genérico)

## Contexto

O harness gera projetos B2B/B2C onde cada cliente (empresa) precisa isolar seus dados. A hierarquia segue o modelo de tenancy de SaaS: a plataforma (você) detém tenants, cada organização contrata o serviço e os clientes finais operam dentro dela.

## Decisão

Adotar a hierarquia:

```
Platform (você)
  └─ Organization (empresa que contrata)
       └─ ClientAccount (cliente final)
```

- `tenantId` é o tenant ativo de cada request — toda entidade de negócio é tenant-scoped
- O middleware de tenancy resolve o tenant a partir do header `X-Tenant-Id` + JWT e injeta o `tenantId` em toda query
- Papéis: `platform-admin` (gerencia a plataforma), `org-owner` (dono da organização), `org-member` (membro com permissões configuráveis), `client-user` (cliente final — lê/edita os próprios dados)
- RBAC define o baseline por papel; ABAC sobrepõe com condições por atributo do recurso

## Consequências positivas

- Isolamento total entre tenants (tenant A não vê dados de tenant B)
- Um usuário pode pertencer a múltiplas organizações/tenants (seletor de tenant)
- Billing por organização (plano cobre a org)
- Base para RBAC/ABAC (`@saas/authorization`) com cache de abilities por `userId+tenantId`

## Trade-offs aceitos

- Complexidade de hierarquia maior que um modelo de tenant único — necessária para B2B
- Resolução de tenancy adiciona overhead de middleware por request

## Alternativas descartadas

- **Tenant único (grupo de usuários doméstico):** não atende SaaS B2B/B2C multi-tenant
- **ABAC puro sem RBAC:** mais flexível, porém mais complexo; RBAC por papel como baseline atende bem a maioria dos casos
- **Permissões por usuário individual:** insustentável em escala