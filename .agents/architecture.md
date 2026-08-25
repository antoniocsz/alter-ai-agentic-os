# .agents/architecture.md
# Carregar para decisões de estrutura (monorepo, packages, fronteiras)

## Quando usar este arquivo

- Criar novo módulo de negócio
- Criar novo package compartilhado
- Mover código entre packages
- Decidir onde algo deve viver
- Configurar ESLint boundaries
- Escrever ADR

## Estrutura de um novo módulo

```bash
packages/modules/<nome>/
├── package.json          # name: "@saas/<nome>", exports: { ".": "./src/index.ts" }
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── events/
│   │   └── repositories/   # interfaces
│   ├── use-cases/
│   └── infra/
│       ├── repositories/   # implementações Prisma
│       └── http/           # controllers + rotas
└── src/index.ts            # barrel — único ponto público
```

## Checklist de novo módulo

- [ ] `package.json` com nome `@saas/<nome>`
- [ ] `src/index.ts` barrel export
- [ ] `context/modules/<nome>/context.md` preenchido
- [ ] `context/modules/<nome>/status.md` criado
- [ ] `eslint-plugin-boundaries` configurado
- [ ] ADR criado se houver decisão arquitetural

## Fronteiras — regra do ESLint boundaries

```
app      → pode importar: module, ui, ui-mobile, api-client, contracts, config
module   → pode importar: contracts, config (NUNCA outro module diretamente)
ui       → pode importar: config
```

## Comunicação entre módulos

```typescript
// ❌ billing importa tenancy
// ✅ billing publica evento → tenancy assina via @saas/contracts
export interface SubscriptionCanceledEvent {
  type: 'subscription.canceled'
  tenantId: string
  occurredAt: Date
}
```

## Os 4+1 apps — onde cada coisa vive

| App | Público | Importa módulos? |
|---|---|---|
| `landing` | Marketing | ❌ só @saas/ui e tipos de @saas/contracts |
| `admin` | Plataforma interna | ✅ todos |
| `organization` | Org contratante | ✅ módulos de negócio |
| `client` | Cliente final | ✅ módulos de negócio (escopo via ABAC) |
| `mobile` | Autenticados | ✅ módulos de negócio |

## ADR — quando criar

Criar em `context/project/adr/` sempre que:
- Uma lib for adotada (ex: CASL, nuqs, WatermelonDB)
- Uma decisão de modelagem for tomada
- Um trade-off consciente for aceito
- Uma decisão anterior for revertida

```markdown
# ADR-00X: [Título]
Data: YYYY-MM-DD
Status: accepted

## Contexto
## Decisão
## Consequências positivas
## Trade-offs aceitos
## Alternativas descartadas
```
