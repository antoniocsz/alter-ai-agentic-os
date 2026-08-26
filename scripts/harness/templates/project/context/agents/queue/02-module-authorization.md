# Task: Módulo authorization (RBAC/ABAC — @saas/authorization)
## Agente: `agente-backend`
## Módulo: `packages/modules/authorization`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/authorization/**`
- `context/modules/authorization/context.md`
- `context/modules/authorization/status.md`
## Depende de: [ ] `01-module-tenancy.md`
## Contexto para ler: context/modules/authorization/context.md
## Skills a carregar: codegen.md + backend.md + authorization.md
## O que já existe: definição do módulo em context/modules/authorization/ (sem código)
## O que criar:
- `harness module authorization` → scaffold da árvore do módulo
- Entidades Role, Module (recurso), Permission, RolePermission
- Interfaces IRoleRepository, IPermissionRepository, IRolePermissionRepository, IAbilityCache
- Use cases: BuildAbilities (CASL), AssertPermission, AssignRole, RemoveRole, CreateRole, UpdateRole, ListRoles, ListPermissions
- AbilityBuilder (RBAC baseline + ABAC conditions) + serialização de rules no JWT
- Seed de roles/permissões padrão (platform-admin, org-owner, org-member, client-user) + roles customizadas por tenant (CreateRole/UpdateRole)
## Especificação:
- RBAC define baseline por papel; ABAC sobrepõe com condições por atributo (ex: `{ tenantId: user.tenantId }`)
- `AssertPermissionUseCase` rejeita acesso sem permissão (ForbiddenError)
- Papel customizado é scoped por tenant (só permissões do próprio tenant); `AssignRole` valida que o papel pertence ao tenant ou é de sistema
- Cache de abilities por `userId+tenantId` (Redis, TTL 5min); invalidado por `membership.changed`/`role.created`/`role.updated`/`role.assigned`/`role.removed`
- `role.assigned`/`role.removed`/`role.created`/`role.updated` publicados via EventBus; consome `user.created` para papel padrão
- Barrel `src/index.ts` exporta só o público
## Critério de conclusão:
- [ ] `harness module authorization` executado e árvore criada
- [ ] Entidades com invariantes e factory methods
- [ ] Use cases completos com DIP (interfaces)
- [ ] Teste de integração: "tenant A não atribui papel/permissão de tenant B"
- [ ] Teste: papel customizado de tenant só contém permissões do próprio tenant
- [ ] Teste: ability rejeita ação sem permissão (ForbiddenError)
- [ ] Barrel export atualizado
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/authorization`
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 02` e registrar handoff
## Complexidade: alta