# template-prisma — Contexto do Módulo

## Responsabilidade
Template de banco de dados gerado por `harness init --prisma` nos projetos novos:
package dedicado `packages/database` (`@saas/database`) com Prisma 7 + adapter pg +
client singleton + `config.ts` + barrel + build tsup + postinstall + seed, alinhado ao
padrão do projeto de referência (diasbellazzi). Inclui também `docker-compose.yml`
(Postgres + Redis) e `.env.example` na raiz do template.

## Entidades
- **Tenant** — modelo `tenants` (id, name, status, timestamps) no schema Prisma
- **ScopedRecord** — modelo `scoped_records` tenant-scoped (tenantId com índices obrigatórios)
- **PrismaClient** — singleton via `globalForPrisma` (dev/hot-reload) com adapter `PrismaPg`

## Use Cases (CLI do projeto gerado)
- `pnpm --filter @saas/database generate|migrate|deploy|studio|build|typecheck`
- `pnpm --filter @saas/database exec prisma db seed` (via `prisma.config.ts` → `tsx prisma/seed.ts`)
- Root scripts: `db:up`, `db:down`, `db:migrate`, `db:deploy`, `db:generate`

## Estrutura do template
- `packages/database/package.json` — `"type": "module"`, exports map (types → src, default → dist), build tsup, `postinstall: prisma generate`
- `packages/database/src/config.ts` — `databaseUrl()` (função lazy: dotenv roda antes da leitura)
- `packages/database/src/client.ts` — singleton `prisma` + `export type TenancyMiddleware`
- `packages/database/src/index.ts` — barrel (`export { prisma }`, `export type { TenancyMiddleware }`, `export * from './generated/prisma/client'`)
- `packages/database/prisma/schema.prisma` — generator `prisma-client` → `../src/generated/prisma`, datasource postgresql
- `packages/database/prisma.config.ts` — `import.meta.dirname` (ESM), `databaseUrl()`, migrations com seed
- `packages/database/prisma/seed.ts` — seed mínimo idempotente (Tenant demo, guarda de NODE_ENV produção)
- `docker-compose.yml` + `.env.example` (raiz do template) — URL bate com o fallback do `config.ts`

## Eventos que Publica
- (n/a — template de infraestrutura, não publica eventos de domínio)

## Eventos que Consome
- (n/a)

## Dependências
- Node ≥ 22 (ESM, `import.meta.dirname`), Prisma 7, `@prisma/adapter-pg`, `pg`, tsup, tsx, dotenv

## Repositórios / Fontes da verdade
- `scripts/harness/templates/prisma/` — fonte do template
- `scripts/harness/src/init.js` — orquestra a cópia do template (`copyDir` com `renderAll`, vars `{{NAME}}`)

## Regras
- **NUNCA** alterar `schema.prisma`, `.env.example` e `docker-compose.yml` sem task dedicada
- `src/generated/` é gitignored (regenerado via `postinstall`/`pnpm generate`)
- `prisma.config.ts` usa `import.meta.dirname` (Node 22 ESM) — `__dirname` quebra o typecheck