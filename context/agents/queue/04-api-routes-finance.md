# Task: Rotas de Finance (API)
## Agente: `agente-backend`
## Módulo: `packages/modules/finance`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/finance/src/infra/http/account.routes.ts`
- `packages/modules/finance/src/infra/http/transaction.routes.ts`
## Depende de: [ ] `02-api-routes-auth.md`
## Contexto para ler: context/modules/finance/context.md
## Skills a carregar: codegen.md + backend.md + billing.md
## O que já existe: use cases de finance (accounts, transactions, balance) e repositório Prisma
## O que criar:
- `account.routes.ts` → GET/POST /api/v1/accounts
- `transaction.routes.ts` → GET/POST /api/v1/transactions, GET /api/v1/balance
## Especificação: GET/POST /api/v1/accounts; GET/POST /api/v1/transactions (com filtros); GET /api/v1/balance (consolidado); validar limite do plano (feature flag) no CreateAccountUseCase e CreateTransactionUseCase
## Critério de conclusão:
- [ ] Rotas registradas
- [ ] Feature flag de plano validada nos use cases de criação
- [ ] Zod validation nos inputs
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 04`
## Complexidade: média