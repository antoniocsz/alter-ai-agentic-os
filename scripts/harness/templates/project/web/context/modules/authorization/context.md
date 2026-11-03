# @saas/authorization — Contexto do Módulo

## Responsabilidade
Autorização RBAC + ABAC: papéis (roles), permissões (permissions) por módulo (resource), construção de abilities (CASL) por usuário+tenant e validação de acesso em controllers/use cases. Fronteira final de segurança — o backend sempre revalida, o frontend só esconde UI.

## Entidades
- **Role** — id, tenantId (null = papel de sistema; caso contrário papel customizado do tenant), name (platform-admin | org-owner | org-member | client-user | custom), isSystem, createdAt
- **Module** — id, key (products, subscriptions, billing...), name — recurso ao qual permissões se aplicam
- **Permission** — id, moduleId, action (create | read | update | delete | approve | pay...), key (products:read), description
- **RolePermission** — roleId, permissionId — baseline RBAC do papel

## Use Cases
- `BuildAbilitiesUseCase` — monta abilities CASL do usuário (baseline RBAC por papel + condições ABAC), serializa rules para o JWT e cacheia no Redis (5min por userId+tenantId)
- `AssertPermissionUseCase` — checa `request.ability.cannot(...)` em controllers/use cases e lança ForbiddenError
- `AssignRoleUseCase` — atribui papel a membro do tenant, publica `role.assigned`, invalida cache de abilities
- `RemoveRoleUseCase` — remove papel, publica `role.removed`, invalida cache de abilities
- `CreateRoleUseCase` — org-owner cria papel customizado do tenant (name + permissões do próprio tenant), publica `role.created`
- `UpdateRoleUseCase` — org-owner ajusta nome/permissões de papel customizado do tenant, publica `role.updated` e invalida cache de abilities
- `ListRolesUseCase` — papéis do tenant (sistema + customizados) para a UI de configuração
- `ListPermissionsUseCase` — permissões disponíveis agrupadas por módulo (para UI de configuração de roles)

## Eventos que Publica
- `role.created`, `role.updated`, `role.assigned`, `role.removed`, `permission.changed`

## Eventos que Consome
- `membership.changed` (@saas/tenancy) — invalida cache de abilities do usuário
- `user.created` (@saas/auth) — aplica papel padrão do tenant (ex: client-user)

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)
- `@casl/ability` (ability building) — serialização via `rulesFor`

## Repositórios
- `IRoleRepository` — interface para persistência de papéis
- `IPermissionRepository` — interface para permissões e módulos
- `IRolePermissionRepository` — interface para vínculo role-permission
- `IAbilityCache` — interface para cache/leitura de abilities (Redis)

## Regras
- RBAC define o baseline por papel; ABAC sobrepõe com condições por atributo do recurso (ex: `{ tenantId: user.tenantId }`)
- Papel de sistema (`tenantId = null`, `isSystem`) é global e imutável via API
- Papel customizado é scoped por tenant: só pode conter permissões de módulos do próprio tenant; `AssignRoleUseCase` valida que o papel pertence ao tenant (ou é de sistema)
- Frontend reconstrói a ability dos `rules` no JWT; o backend SEMPRE revalida com `AssertPermissionUseCase`
- Cache de abilities por `userId+tenantId`, TTL 5min, invalidado em `membership.changed` / `role.created` / `role.updated` / `role.assigned` / `role.removed`
- Permissões de sistema (`isSystem`) não podem ser alteradas via API