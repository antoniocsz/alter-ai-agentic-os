# @saas/analytics — Contexto do Módulo

## Responsabilidade
ETL de eventos de negócio do PostgreSQL para o ClickHouse, geração de insights (KPIs, tendências, ML) e relatórios exportáveis. Dashboards via Metabase apontando para o ClickHouse — sem impacto na API.

## Entidades
- **AnalyticsEvent** (ClickHouse) — tenantId, type (transaction.created, invoice.paid...), payloadJson, occurredAt
- **InsightSnapshot** — resultado de análise (agregações/ML) materializado e cacheado

## Use Cases
- `RunEtlUseCase` — cron a cada 5min: lê eventos pendentes do Postgres, insere no ClickHouse (batch, idempotente)
- `GetInsightsUseCase` — KPIs/tendências por tenant; resultados cacheados no Redis (30min)
- `ExportReportUseCase` — gera relatório (CSV/PDF) para download (Premium)

## Eventos que Publica
- `report.generated`

## Eventos que Consome
- Eventos de negócio (via EventBus) → enfileira para o ETL (nunca grava direto no ClickHouse no request path)

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)
- ClickHouse (queries analíticas NUNCA no Postgres principal)

## Repositórios
- `IAnalyticsEventRepository` — interface para leitura/inserção no ClickHouse

## Regras
- ETL Postgres → ClickHouse, nunca ao contrário
- Idempotência: eventos processados pelo menos uma vez; dedupe por idempotency key
- Queries analíticas exclusivamente no ClickHouse; expostas via `/analytics/insights`