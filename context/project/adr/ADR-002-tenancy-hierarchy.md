# ADR-002: Hierarquia de Tenancy — Família como Unidade Principal

**Data:** 2025-01-01
**Status:** accepted

## Contexto

O Sistema é um app de gestão financeira focado em famílias. Diferente de um SaaS B2B tradicional (Platform → Organization → ClientAccount), precisamos que a família seja a unidade principal de agrupamento.

## Decisão

Adotar a hierarquia:

```
Platform
  └─ Family (até 5 membros)
       ├─ User (admin)
       ├─ User (member)
       └─ User (viewer)
```

- `familyId` é o tenant principal — toda entidade de negócio é scoped por família
- Um usuário pertence a exatamente uma família por vez
- Papéis dentro da família: admin (convida/remove/gerencia billing), member (opera), viewer (só lê)
- Usuários sem família (pré-convite) podem existir mas sem acesso a dados financeiros

## Consequências positivas

- Modelo de permissões simples e claro
- Billing por família (um Premium cobre todos)
- Isolamento total entre famílias (tenant A não vê dados de tenant B)
- Convidar membros é intuitivo para o usuário final

## Trade-offs aceitos

- Usuário não participa de múltiplas famílias simultaneamente (simplificação para MVP)
- Mudar de família requer sair de uma e entrar em outra

## Alternativas descartadas

- **Usuário individual isolado:** sem compartilhamento familiar — não atende o requisito
- **Hierarquia completa (Platform → Org → ClientAccount):】 complexidade desnecessária para PF
- **Permissões por recurso (ABAC puro):】 mais flexível mas mais complexo; RBAC por papel atende bem
