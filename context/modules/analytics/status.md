# @saas/analytics — Status

## Fase 1 — Fundação
- [ ] Domain entities (AnalyticsEvent, InsightSnapshot)
- [ ] Repository interface (IAnalyticsEventRepository)
- [ ] Use cases (RunEtl, GetInsights, ExportReport)
- [ ] Implementação ClickHouse + consumo de eventos via EventBus
- [ ] Cron de ETL (5min, idempotente)
- [ ] Testes unitários
- [ ] Testes de integração (dedupe, isolamento por tenant)

## Fase 2 — Refinamentos
- [ ] ML (linearRegression, kMeans, detectAnomalies) exposto via `/analytics/insights`
- [ ] Exportação de relatório (CSV/PDF) para plano Premium
- [ ] Metabase conectado ao ClickHouse
- [ ] Typecheck: [ ]

## Handoff
- [ ] Preenchido ao finalizar cada task: feito / pendências / decisões