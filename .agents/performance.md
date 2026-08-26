# .agents/performance.md
# Carregar para tarefas de performance (API, frontend, mobile, banco)

## Backend — API

- **N+1:** nunca carregar relação em loop — `include`/`_count` explícitos (ver `.agents/data.md`)
- **Paginação:** cursor em tabelas grandes, nunca offset
- **Cache Redis:** listagens 2min, abilities 5min, contadores write-through
- **Índices:** `@@index([tenantId, createdAt])` para listagens ordenadas
- **Latência alvo:** p95 < 300ms; usar `server.inject()` ou loader para medir
- **Payloads:** nunca retornar campos não usados (select explícito)

## Frontend web — Core Web Vitals

| Métrica | Alvo |
|---|---|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |

- **Code-splitting:** dynamic import de rotas e componentes pesados (gráficos, tabelas)
- **Bundle budget:** avisar em PR se `dist` cresce > X%; monitorar com `webpack-bundle-analyzer`/`size-limit`
- **TanStack Query:** `staleTime` adequado; prefetch de listagens ao hover/navegar
- **Gráficos:** Recharts com memoização; dados agregados no backend (nunca 10k pontos no client)
- **Imagens:** `next/image` com width/height e lazy loading

## Mobile

- **Listas:** FlashList (nunca ScrollView com map de itens grandes)
- **Re-renders:** memoizar items; evitar funções inline em render; perf com React DevTools Profiler
- **Bundle JS:** EAS update entrega JS; monitorar tamanho; assets com `image: { compress }`
- **Startup:** inicialização lazy de módulos pesados; não bloquear primeira render com I/O
- **Animações:** Reanimated (worklets na UI thread)

## Como medir

```
Backend:  pnpm turbo test --filter=@saas/app-api (loader de perf) + métricas RED
Web:      web-vitals no app + Lighthouse CI (thresholds) no pipeline
Mobile:   React DevTools Profiler + métricas de start no EAS
```

## Checklist

- [ ] Sem N+1 em fluxos de listagem/detalhe
- [ ] Paginação por cursor em tabelas grandes
- [ ] LCP/INP/CLS dentro do alvo nas páginas principais
- [ ] Listas mobile com FlashList
- [ ] Bundle size monitorado com budget