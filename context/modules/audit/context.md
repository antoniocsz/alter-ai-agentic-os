# @saas/audit — Contexto do Módulo

## Responsabilidade
Trilha de auditoria de ações críticas no sistema. Cumpre obrigação legal de retenção (LGPD — 5 anos) e alimenta investigações e conformidade.

## Entidades
- **AuditLog** — id, tenantId, userId, action (create/update/delete/login/privacy), resource, resourceId, metaJson, ip, occurredAt

## Use Cases
- `RecordAuditLogUseCase` — registra ação crítica (chamado por handlers/controllers, nunca no request path quente)
- `QueryAuditLogUseCase` — consulta com filtros (tenantId, resource, action, período) — scoped por tenant
- `ExportAuditLogUseCase` — exporta dados do usuário (LGPD: `GET /privacy/my-data`)

## Eventos que Publica
- Nenhum

## Eventos que Consome
- Eventos críticos via EventBus (ex: `subscription.changed`, `user.updated`, `membership.changed`) → grava AuditLog de forma desacoplada

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)

## Repositórios
- `IAuditLogRepository` — interface para persistência (append-only; sem update/delete)

## Regras
- Append-only: `AuditLog` nunca é alterado nem removido
- Escrita assíncrona/fora do caminho crítico (fila BullMQ), sem bloquear o request
- Indexado por `[tenantId, occurredAt]` e `[resource, resourceId]`