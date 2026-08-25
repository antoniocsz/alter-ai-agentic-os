# Stack Técnica — Sistema

## Monorepo
- Turborepo + pnpm workspaces
- TypeScript strict
- ESLint flat config + Prettier

## Backend
- **Runtime:** Node.js 22 + TypeScript
- **Framework:** Fastify + @fastify/jwt + @fastify/swagger
- **ORM:** Prisma + PostgreSQL
- **Cache:** Redis (ioredis)
- **Validação:** Zod
- **Email:** Resend + React Email
- **Storage:** Cloudflare R2 (S3-compatible)
- **Pagamentos:** Stripe
- **Filas:** BullMQ (Redis)
- **Testes:** Vitest + Supertest

## Frontend Web
- **Framework:** Next.js 16 (App Router)
- **Estado servidor:** TanStack Query
- **Estado cliente:** Zustand
- **Forms:** React Hook Form + Zod resolver
- **UI:** shadcn/ui + Tailwind v4
- **Ícones:** lucide-react
- **Gráficos:** Recharts
- **Animações:** Framer Motion
- **Testes:** Vitest + Testing Library

## Mobile
- **Framework:** Expo (bare workflow) + Expo Router
- **Estilização:** NativeWind (Tailwind)
- **Estado servidor:** TanStack Query
- **Estado cliente:** Zustand + MMKV
- **Forms:** React Hook Form + Zod resolver
- **Ícones:** lucide-react-native
- **Animações:** Reanimated
- **Listas:** FlashList
- **Testes:** React Native Testing Library + Vitest

## Infraestrutura
- **Banco:** PostgreSQL + Redis
- **Cache:** Redis (allkeys-lru, TTL 5-60 min)
- **Deploy:** EasyPanel (VPS) + Docker
- **Mobile:** EAS (Expo Application Services)
- **CI/CD:** GitHub Actions
- **Analytics:** ClickHouse + Metabase
