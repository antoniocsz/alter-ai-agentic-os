# @saas/authorization — Status

## Fase 1 — Fundação
- [ ] Domain entities (Role, Module, Permission, RolePermission)
- [ ] Repository interfaces (IRoleRepository, IPermissionRepository, IRolePermissionRepository, IAbilityCache)
- [ ] Use cases (BuildAbilities, AssertPermission, AssignRole, RemoveRole, CreateRole, UpdateRole, ListRoles, ListPermissions)
- [ ] Prisma repository implementations + seed de roles/permissões padrão
- [ ] AbilityBuilder CASL (RBAC baseline + ABAC conditions) e serialização no JWT
- [ ] Middleware/permissão nos controllers (AssertPermissionUseCase)
- [ ] Testes unitários
- [ ] Testes de integração (isolamento por tenant; roles)

## Fase 2 — Refinamentos
- [ ] Cache de abilities no Redis invalidado por `membership.changed` / `role.created` / `role.updated` / `role.assigned` / `role.removed`
- [ ] Seletor de permissões no frontend consumindo `ListPermissionsUseCase` + `ListRolesUseCase`
- [ ] Roles customizadas por tenant (org-owner cria/edita via CreateRole/UpdateRole)
- [ ] Typecheck: [ ]

## Handoff
- [ ] Preenchido ao finalizar cada task: feito / pendências / decisões