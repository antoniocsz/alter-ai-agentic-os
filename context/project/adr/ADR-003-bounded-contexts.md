# ADR-003: Bounded Contexts

**Data:** 2025-01-01
**Status:** accepted

## Contexto

Organizar o domínio de finanças pessoais familiares em bounded contexts (módulos) que isolem regras de negócio, evitem acoplamento e possam evoluir independentemente.

## Decisão

Dividir o domínio nos seguintes módulos:

| Módulo | Responsabilidade | Eventos que publica |
|--------|-----------------|---------------------|
| `@saas/auth` | Cadastro, login, JWT, refresh token, gestão de perfil | `user.created`, `user.updated` |
| `@saas/family` | Criação de família, convites, papéis, membresia | `member.invited`, `member.joined`, `member.removed` |
| `@saas/finance` | Contas, categorias, transações (receitas/despesas) | `transaction.created`, `account.balance.changed` |
| `@saas/budget` | Orçamentos mensais, metas financeiras | `budget.limit.exceeded`, `goal.completed` |
| `@saas/credit-card` | Cartões de crédito, faturas, transações de cartão | `invoice.created`, `invoice.paid` |
| `@saas/bill` | Contas a pagar/receber, recorrências | `bill.paid`, `bill.overdue` |
| `@saas/dashboard` | KPIs, gráficos, visão consolidada | (consome eventos, não publica) |
| `@saas/report` | Relatórios, exportação CSV/PDF | `report.generated` |
| `@saas/billing` | Planos, feature flags, Stripe checkout/webhooks | `subscription.changed`, `subscription.canceled` |
| `@saas/notification` | Alertas, lembretes, notificações push/email | (consome eventos) |

## Consequências positivas

- Cada módulo pode ser testado e implantado independentemente
- Fronteiras claras evitam acoplamento indevido
- Eventos permitem reação sem dependência direta entre módulos
- Novo desenvolvedor entende o domínio por módulo

## Trade-offs aceitos

- Comunicação via eventos adiciona latência (vs chamada direta)
- Eventual consistency entre módulos

## Alternativas descartadas

- **Módulo financeiro gigante:** difícil de testar e evoluir
- **CRUD puro sem eventos:** impossível ter dashboard reativo sem poluir use-cases
