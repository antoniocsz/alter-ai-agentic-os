# .agents/observability.md
# Carregar para tarefas de observabilidade (logs, telemetria, erros, alertas)

## Logs estruturados — sempre JSON

```typescript
// Fastify usa pino por padrão — nunca console.log
request.log.info({ tenantId, resource: 'Ocorrencia', action: 'create' }, 'recurso criado')
// Correlation id: request id do Fastify propagado em toda a cadeia
// Nível por ambiente: debug (dev) | info (prod) | error (erros)
```

- Nunca logar dados pessoais, tokens ou corpos sensíveis (LGPD)
- Logs de erro: `request.log.error({ err, tenantId, resourceId }, 'falha ao criar')`

## Telemetria — OpenTelemetry

```
- Traces: @opentelemetry/sdk-node + auto-instrumentations (http, fastify, prisma, redis, bullmq)
- Métricas: contadores por rota (RED — Rate, Errors, Duration), dependências externas
- Exporter: OTLP (porta 4317) ou Prometheus
- Span names: método + rota (`GET /occurrences`), nunca com dados do request
```

## Error tracking — Sentry

- `@sentry/node` com release = hash do commit; source maps no build
- `Sentry.captureException(err)` no handler global do Fastify (junto do erro logado)
- Ignorar erros esperados (DomainError 4xx) — só reportar 5xx e exceções inesperadas

## Métricas e dashboards

| Sinal | Alvo |
|---|---|
| erro por rota | < 0.5% |
| latência p95 | < 300ms (API) |
| uptime | 99.9% |
| filas (BullMQ) | fila não cresce: alerta se depth > X por 5min |

## Alertas

- Budget de erro (Sentry) e latência p95 (Prometheus)
- Healthcheck `GET /health` obrigatório em todos os serviços (EasyPanel usa)
- Alertas por e-mail/Slack em falha de fila, erro > budget, DB down

## Checklist

- [ ] Nenhum console.log; logs estruturados com correlation id
- [ ] Error handler global captura no Sentry (só 5xx)
- [ ] Traces exportados com span de rota + tenantId como atributo
- [ ] Métricas RED por rota configuradas