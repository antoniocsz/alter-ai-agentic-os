# .agents/data.md
# Carregar para tarefas de dados (Prisma, Redis, ClickHouse, ML)

## Modelagem — regras obrigatórias

```prisma
model Entidade {
  id        String   @id @default(cuid())
  tenantId  String                        // obrigatório em toda tabela scoped
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])                     // índice obrigatório
  @@index([tenantId, createdAt])          // para listagens ordenadas
  @@map("entidades")                      // snake_case no banco
}
```

## Queries — padrões de performance

```typescript
// Cursor pagination — nunca offset em tabelas grandes
findMany({ take: limit + 1, cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : 0 })

// Include explícito — nunca carregar relação em loop (N+1)
include: { _count: { select: { ocorrencias: true } } }

// Raw só com parâmetros tipados — nunca interpolação de string
prisma.$queryRaw`SELECT * FROM x WHERE id = ${id}`
```

## Cache Redis — estratégia por tipo

| Dado | TTL | Invalidar quando |
|---|---|---|
| CASL abilities | 5min | role muda |
| Listagens | 2min | qualquer write no recurso |
| Contadores | write-through | junto com a escrita |
| Analytics | 30min | cron de ETL |

Keys com namespace: `saas:<entidade>:<tenantId>:<id>`
SCAN em vez de KEYS em produção.

## Analytics — Postgres → ClickHouse (nunca ao contrário)

ETL cron a cada 5min sincroniza eventos para ClickHouse.
Metabase aponta para ClickHouse — sem impacto na API.
Queries analíticas NUNCA rodam no Postgres principal.

## ML em TypeScript — 4 algoritmos disponíveis

- `linearRegression(points)` → previsão de séries temporais com R²
- `kMeans(points, k)` → segmentação (k-means++)
- `detectAnomalies(series, threshold)` → z-score com severity
- `movingAverage(series, window)` / `exponentialMovingAverage(series, alpha)` → suavização

Resultados cacheados no Redis (30min). Expostos via `/analytics/insights`.
