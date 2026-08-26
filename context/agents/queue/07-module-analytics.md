# Task: Módulo analytics (fundação @saas/analytics)
## Agente: `agente-backend`
## Módulo: `packages/modules/analytics`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/analytics/**`
- `context/modules/analytics/context.md`
- `context/modules/analytics/status.md`
## Depende de: [ ] `05-module-tenancy.md`
## Contexto para ler: context/modules/analytics/context.md
## Skills a carregar: codegen.md + backend.md + data.md
## O que já existe: definição do módulo em context/modules/analytics/ (sem código)
## O que criar:
- `harness module analytics` → scaffold da árvore do módulo
- Entidades AnalyticsEvent e InsightSnapshot
- Interface IAnalyticsEventRepository
- Use cases: RunEtl, GetInsights, ExportReport
- Implementação ClickHouse + consumer de eventos (EventBus) + cron de ETL
## Especificação:
- ETL Postgres → ClickHouse a cada 5min, idempotente (idempotency key)
- Queries analíticas NUNCA no Postgres principal
- Resultados cacheados no Redis (30min); expostos via `/analytics/insights`
- Isolamento por tenantId em toda consulta de insights
- Barrel `src/index.ts` exporta só o público
## Critério de conclusão:
- [ ] `harness module analytics` executado e árvore criada
- [ ] Use cases completos com DIP (interfaces)
- [ ] Teste de integração: dedupe de eventos + "tenant A não vê insight de B"
- [ ] Cron de ETL registrado (5min)
- [ ] Barrel export atualizado
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/analytics`
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 07` e registrar handoff
## Complexidade: alta