# @saas/audit — Status

## Fase 1 — Fundação
- [ ] Domain entity (AuditLog — append-only)
- [ ] Repository interface (IAuditLogRepository)
- [ ] Use cases (Record, Query, Export)
- [ ] Prisma repository implementation
- [ ] Consumer de eventos críticos (EventBus)
- [ ] Testes unitários
- [ ] Testes de integração (isolamento por tenant; append-only)

## Fase 2 — Refinamentos
- [ ] Escrita via fila (BullMQ) fora do request path
- [ ] Endpoint LGPD `GET /privacy/my-data` consumindo ExportAuditLogUseCase
- [ ] Retenção/arquivamento > 5 anos
- [ ] Typecheck: [ ]

## Handoff
- [ ] Preenchido ao finalizar cada task: feito / pendências / decisões