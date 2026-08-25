# .agents/authorization.md
# Carregar para tarefas de permissão (CASL + RBAC + ABAC)

## Hierarquia de roles

```
platform-admin → manage all
org-owner      → manage tudo da própria org
org-member     → permissões configuráveis
client-user    → lê/edita só os próprios dados
```

## AbilityBuilder — combina RBAC + ABAC

```typescript
// RBAC: papel define baseline
role.permissions.forEach((p) => can(p.action, p.subject))

// ABAC: condição por atributo do recurso (sobrepõe RBAC)
can('update', 'Ocorrencia', { tenantId: user.tenantId })
cannot('delete', 'Invoice', { status: 'paid' })
```

## Uso no controller

```typescript
// Simples (RBAC)
if (request.ability.cannot('create', 'Ocorrencia')) throw new ForbiddenError()

// Com recurso (ABAC) — sempre usar subject() para condições funcionarem
const ocorrencia = await repo.findById(id)
if (request.ability.cannot('delete', subject('Ocorrencia', ocorrencia))) throw new ForbiddenError()
```

## Frontend — reconstruir Ability do JWT

```typescript
// Backend serializa rules no JWT → frontend reconstrói
const ability = createMongoAbility(session?.abilityRules ?? [])
// Frontend esconde UI — backend sempre revalida
```

## Cache de abilities — Redis, TTL 5min por userId+tenantId

Invalidar quando role mudar: `redis.del(`ability:${tenantId}:${userId}`)`
