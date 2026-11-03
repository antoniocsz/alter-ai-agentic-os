# Task: Template database alinhado ao padrao diasbellazzi
## Agente: `backend`
## Módulo: `template-prisma`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/prisma`
- `scripts/harness/src/init.js`
- `scripts/harness/src/module.js`
- `scripts/harness/templates/project/.github/workflows/ci.yml`
- `scripts/harness/templates/project/.gitignore`
- `scripts/harness/tests/init.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/project/overview.md + context/project/stack.md (harness é self-hosting; não há context/modules/template-prisma)
## Skills a carregar: codegen.md + backend.md + architecture.md
## O que já existe:
- Template `scripts/harness/templates/prisma/packages/prisma/` (package `@saas/prisma`): schema.prisma (generator `prisma-client` → `../src/generated/prisma`, datasource postgresql, modelos Tenant/ScopedRecord), prisma.config.ts (dotenv raiz + env('DATABASE_URL')), src/index.ts (PrismaClient + PrismaPg inline), tsconfig.json, mais docker-compose.yml + .env.example na raiz do template.
- Referências a `@saas/prisma`/`packages/prisma`: `scripts/harness/src/init.js` (DB_SCRIPTS + mensagem de saída), `scripts/harness/src/module.js` (deps `--with-prisma`), `scripts/harness/templates/project/.github/workflows/ci.yml` (generate no CI).
- O `.gitignore` do template de projeto NÃO ignora `src/generated/` (só `dist/` e `.env.*`).
## Objetivo: alinhar o template ao padrão do projeto de referência (`packages/database` do diasbellazzi): package dedicado com Prisma 7 + adapter pg + client singleton + config.ts + barrel + build tsup + postinstall + seed + generated ignorado no git.
## O que criar:
1. Renomear `scripts/harness/templates/prisma/packages/prisma/` → `scripts/harness/templates/prisma/packages/database/` (git mv preserva histórico)
2. `packages/database/package.json` → reescrever (name `@saas/database`, build tsup, exports map, postinstall)
3. `packages/database/src/config.ts` → NOVO: `databaseUrl` com fallback dev `postgresql://postgres:postgres@localhost:5432/{{NAME}}` (função lazy — ver especificação)
4. `packages/database/src/client.ts` → NOVO: singleton `globalForPrisma` + `PrismaPg` + export type `TenancyMiddleware`
5. `packages/database/src/index.ts` → reescrever como barrel (`export { prisma }`, `export type { TenancyMiddleware }`, `export * from './generated/prisma/client'`)
6. `packages/database/prisma.config.ts` → reescrever: `import.meta.dirname` (ESM, typecheckável), `databaseUrl()`, migrations com `seed: 'tsx prisma/seed.ts'`
7. `packages/database/prisma/seed.ts` → NOVO: seed mínimo idempotente (ex: upsert de um Tenant demo, com guarda de NODE_ENV produção)
8. `packages/database/tsconfig.json` → reescrever: `include: ["src/**/*.ts", "prisma.config.ts"]` + `compilerOptions.types: ["node"]`
9. `scripts/harness/src/init.js` → `@saas/prisma` → `@saas/database` (DB_SCRIPTS, 3x) + mensagem `packages/prisma` → `packages/database`
10. `scripts/harness/src/module.js` → deps `@saas/prisma` → `@saas/database`
11. `scripts/harness/templates/project/.github/workflows/ci.yml` → `--filter @saas/prisma generate` → `--filter @saas/database generate`
12. `scripts/harness/templates/project/.gitignore` → adicionar `packages/database/src/generated/`
13. `scripts/harness/tests/init.test.js` → adicionar teste smoke: `init([target, '--prisma'])` valida que `packages/database/package.json` existe, tem name `@saas/database`, `src/config.ts`/`src/client.ts` existem e `prisma.config.ts` usa `databaseUrl()`
## Especificação:
- **package.json** (padrão diasbellazzi): `"type": "module"`, `"main": "./dist/index.js"`, `"types": "./src/index.ts"`, exports `{ ".": { "types": "./src/index.ts", "default": "./dist/index.js" } }`; scripts: `build: tsup src/index.ts --format esm --platform node --target node22 --sourcemap --clean`, `generate: prisma generate`, `migrate: prisma migrate dev`, `deploy: prisma migrate deploy`, `studio: prisma studio`, `typecheck: tsc --noEmit`, `postinstall: prisma generate`; deps: `@prisma/adapter-pg`, `@prisma/client`, `dotenv`, `pg`; devDeps: `@types/node`, `@types/pg`, `prisma`, `tsup`, `tsx`, `typescript`. Manter o placeholder de escopo `@saas` (consistente com `@saas/tenancy` etc.; o projeto real renomeia o escopo).
- **config.ts**: `const DEV_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/{{NAME}}'` e `export const databaseUrl = (): string => process.env.DATABASE_URL ?? DEV_DATABASE_URL`. FUNÇÃO (não const) para que o dotenv do prisma.config.ts rode antes da leitura (ordem de avaliação ESM: imports primeiro → função é avaliada só na chamada).
- **client.ts**: `const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }`; `export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) })`; guard `if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma`; manter `export type TenancyMiddleware = (tenantId: string) => void` (contrato do middleware — o módulo @saas/tenancy implementa).
- **index.ts**: `export { prisma } from './client'`, `export type { TenancyMiddleware } from './client'`, `export * from './generated/prisma/client'` (cobre `Prisma`/`PrismaClient` — NÃO duplicar exports).
- **prisma.config.ts**: manter o carregamento do `.env` da raiz do monorepo, mas com `import.meta.dirname` (Node 22; `__dirname` não existe em ESM e quebraria o typecheck com o novo tsconfig): `config({ path: path.resolve(import.meta.dirname, '../../.env') })`. Usar `defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' }, datasource: { url: databaseUrl() } })`.
- **seed.ts**: importar `prisma` de `../src/client`, upsert idempotente de um registro demo (ex: Tenant "Default") com `console.log` final; pular em `NODE_ENV === 'production'`.
- **schema.prisma**: NÃO alterar (já está correto: generator `prisma-client` output `../src/generated/prisma`, datasource postgresql, Tenant/ScopedRecord).
- **tsconfig.json**: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src/**/*.ts", "prisma.config.ts"] }`.
- **.env.example / docker-compose.yml**: NÃO alterar (URL já bate com o fallback de config.ts: `postgresql://postgres:postgres@localhost:5432/{{NAME}}`).
## Critério de conclusão:
- [ ] Pasta renomeada para `packages/database` (git mv) com os 5 arquivos de src/ + prisma/ + configs
- [ ] Zero referências restantes a `@saas/prisma` e `packages/prisma` no repo (grep)
- [ ] `pnpm harness check` limpo
- [ ] `pnpm test` passando (inclui o novo teste smoke `--prisma`)
- [ ] Typecheck do harness passando (node --check nos arquivos JS alterados ou `pnpm test` cobre)
- [ ] Nenhum outro arquivo tocado fora do ## Escopo
## Ao terminar: rodar `pnpm harness finish 16-template-database-alinhado-ao-padrao-diasbellazz.md` e registrar handoff
## Complexidade: media

## Baseline (git)
- context/agents/queue/16-template-database-alinhado-ao-padrao-diasbellazz.md
