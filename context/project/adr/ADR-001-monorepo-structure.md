# ADR-001: Estrutura do Monorepo

**Data:** 2025-01-01
**Status:** accepted

## Contexto

Iniciar um projeto full-stack que abrange backend (API), frontend (web) e mobile (React Native/Expo), com múltiplos bounded contexts compartilhados entre os apps. Precisamos de uma estrutura que permita compartilhar tipos, schemas e lógica sem duplicação.

## Decisão

Adotar Turborepo + pnpm workspaces com a seguinte estrutura:

```
apps/
  api/          Fastify + Prisma + Redis
  web/          Next.js 16 (App Router)
  mobile/       Expo bare

packages/
  modules/      Bounded contexts (@saas/tenancy, @saas/auth, etc.)
  ui/           Design system web (shadcn/ui + Tailwind)
  ui-mobile/    Componentes React Native (NativeWind)
  api-client/   HTTP client compartilhado (web + mobile)
  contracts/    Tipos, schemas Zod, eventos de domínio
  config/       Configs compartilhadas (eslint, tsconfig, tailwind)
```

## Consequências positivas

- Tipos e schemas Zod em `@saas/contracts` servem backend e frontend
- `@saas/api-client` é consumido por web e mobile — mesma lógica HTTP
- ESLint boundaries impedem imports diretos entre módulos
- Turborepo acelera builds com cache

## Trade-offs aceitos

- Complexidade inicial maior que um monorepo simples
- Curva de aprendizado do Turborepo para novos contribuidores

## Alternativas descartadas

- **Monólito:** apps separados sem monorepo — duplicação de tipos e schemas
- **Nx:** mais opinado que Turborepo, overhead desnecessário
- **Single repo sem workspaces:** sem isolamento de dependências
