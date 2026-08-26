# Task: Módulo audit (fundação @saas/audit)
## Agente: `agente-backend`
## Módulo: `packages/modules/audit`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/audit/**`
- `context/modules/audit/context.md`
- `context/modules/audit/status.md`
## Depende de: [ ] `05-module-tenancy.md`
## Contexto para ler: context/modules/audit/context.md
## Skills a carregar: codegen.md + backend.md + architecture.md
## O que já existe: definição do módulo em context/modules/audit/ (sem código)
## O que criar:
- `harness module audit` → scaffold da árvore do módulo
- Entidade AuditLog (append-only)
- Interface IAuditLogRepository
- Use cases: Record, Query, Export
- Implementação Prisma + consumer de eventos críticos via EventBus
## Especificação:
- Append-only: nenhum update/delete no repositório de audit
- Escrita assíncrona (fila BullMQ) — nunca bloquear o request
- Índices `[tenantId, occurredAt]` e `[resource, resourceId]`; `@@map("audit_logs")`
- Query scoped por tenantId (ForbiddenError cross-tenant)
- Barrel `src/index.ts` exporta só o público
## Critério de conclusão:
- [ ] `harness module audit` executado e árvore criada
- [ ] Entidade com invariantes (action/recurso obrigatórios)
- [ ] Use cases completos com DIP (interfaces)
- [ ] Teste de integração: "tenant A não vê audit de tenant B"
- [ ] Teste: append-only (update/delete rejeitados)
- [ ] Barrel export atualizado
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/audit`
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 06` e registrar handoff
## Complexidade: média