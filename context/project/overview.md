# VemPlanejar — Visão Geral do Projeto

## Problema

Famílias brasileiras têm dificuldade em organizar as finanças de forma conjunta. Apps existentes são focados em indivíduos ou empresas — falta uma solução que atenda o orçamento familiar com simplicidade.

## Produto

VemPlanejar é um app de gestão financeira familiar com:

- Controle de receitas e despesas (individuais e compartilhadas)
- Contas conjuntas com visibilidade por membro
- Orçamentos e metas familiares
- Cartão de crédito com controle de faturas
- Contas a pagar/receber com recorrência
- Dashboard com KPIs e gráficos
- Relatórios exportáveis (Premium)
- Planos Free e Premium (assinatura Stripe)

## Público

Famílias de até 5 membros. Cada membro tem um papel (admin, member, viewer).

## Stack

Monorepo Turborepo | Fastify + Prisma + PostgreSQL + Redis | Next.js 16 + Tailwind + shadcn/ui | Expo + NativeWind | TanStack Query | Zustand | Zod | Stripe | Resend

## Princípios

- Família como unidade principal de tenancy
- MVVM estrito no frontend e mobile
- Comunicação entre módulos via eventos
- Dependency Inversion — use-cases dependem de interfaces
- Feature flags por plano (Free vs Premium)
