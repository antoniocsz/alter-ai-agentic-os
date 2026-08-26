# @saas/finance — Contexto do Módulo

## Responsabilidade
Contas, categorias e transações (receitas/despesas) do orçamento familiar.

## Entidades
- **Account** — id, familyId, name, type (checking | savings | credit), balance
- **Category** — id, familyId, name, type (income | expense)
- **Transaction** — id, accountId, categoryId, amount, type (income | expense), date, description

## Use Cases
- `CreateAccountUseCase` / `ListAccountsUseCase` — contas
- `CreateTransactionUseCase` / `ListTransactionsUseCase` — transações (com filtros)
- `GetBalanceUseCase` — saldo consolidado

## Eventos que Publica
- `transaction.created`, `account.balance.changed`

## Eventos que Consome
- Nenhum

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)

## Repositórios
- `IAccountRepository` — interface para persistência de contas
- `ICategoryRepository` — interface para categorias
- `ITransactionRepository` — interface para transações