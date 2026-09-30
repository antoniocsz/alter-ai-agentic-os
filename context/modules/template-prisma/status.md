# template-prisma — Status

## Fase 1 — Template inicial (`packages/prisma`)
- [x] Template `scripts/harness/templates/prisma/packages/prisma/` (package `@saas/prisma`): schema Prisma (Tenant/ScopedRecord), prisma.config.ts, src/index.ts, tsconfig.json
- [x] `docker-compose.yml` (Postgres + Redis) e `.env.example` na raiz do template
- [x] Referências em `init.js` (DB_SCRIPTS + mensagem), `module.js` (deps `--with-prisma`), `ci.yml` (generate)

## Fase 2 — Alinhado ao padrão diasbellazzi (`packages/database`, task 16)
- [x] Pasta renomeada `packages/prisma` → `packages/database` via `git mv` (histórico preservado)
- [x] `package.json` reescrito: name `@saas/database`, `"type": "module"`, build tsup (target node22), exports map, `postinstall: prisma generate`
- [x] `src/config.ts` novo: `databaseUrl()` função lazy com fallback `postgresql://postgres:postgres@localhost:5432/{{NAME}}`
- [x] `src/client.ts` novo: singleton `globalForPrisma` + `PrismaPg` + `export type TenancyMiddleware`
- [x] `src/index.ts` reescrito como barrel (sem exports duplicados)
- [x] `prisma.config.ts` reescrito: `import.meta.dirname` (ESM), `databaseUrl()`, migrations com `seed: 'tsx prisma/seed.ts'`
- [x] `prisma/seed.ts` novo: upsert idempotente de Tenant demo com guarda de NODE_ENV produção
- [x] `tsconfig.json` reescrito: `include: ["src/**/*.ts", "prisma.config.ts"]` + `types: ["node"]`
- [x] Referências `@saas/prisma`/`packages/prisma` → `@saas/database`/`packages/database` em `init.js`, `module.js`, `ci.yml` (zero restantes em código)
- [x] `.gitignore` do template de projeto ignora `packages/database/src/generated/`
- [x] Teste smoke `init --prisma` em `tests/init.test.js` (package.json, config.ts/client.ts, prisma.config.ts, path antigo removido)
- [x] `schema.prisma`, `.env.example` e `docker-compose.yml` inalterados (URL já bate com o fallback do config.ts)
- [x] `pnpm test` 70/70 | `pnpm harness check` limpo

## Fase 3 — README atualizado (task 17)
- [x] `README.md` linhas 108 e 130: `packages/prisma` → `packages/database` (flag `--prisma` do `harness init` e passo "Inicializar")
- [x] `grep -n "packages/prisma" README.md` → zero | `pnpm harness check` limpo

## Fase 3 — Newline final nos 8 arquivos do template (task 18)
- [x] `\n` final adicionado nos 8 arquivos do escopo (package.json, prisma.config.ts, src/index.ts, src/config.ts, src/client.ts, tsconfig.json, prisma/seed.ts, tests/init.test.js)
- [x] Verificado com `tail -c 1 | od -An -c` → todos terminam em `\n`; `git diff` mostra apenas a adição do `\n` (sem outras mudanças)
- [x] `pnpm test` 70/70 | `pnpm harness check` limpo

## Fase 4 — Teste real E2E do template database (task 19)
- [x] `pnpm --filter @saas/database typecheck` OK (tsc --noEmit cobre src/**/*.ts + prisma.config.ts com import.meta.dirname)
- [x] `pnpm turbo typecheck` OK (5/5 packages do monorepo temp)
- [x] `prisma migrate dev --name init` aplicou `20260930034639_init` no Postgres (tabelas `tenants`/`scoped_records` existem; migration.sql com índices tenantId)
- [x] `prisma db seed` criou `tenant-default` (upsert idempotente — rodado 2x, 1 única linha)
- [x] Build tsup confirmado: `dist/index.js` existe e foi exercitado de ponta a ponta (import direto do bundle → singleton + PrismaPg → leitura real do tenant no Postgres)
- [x] Estrutura validada vs padrão diasbellazzi: package.json (`@saas/database`, exports map), `src/config.ts` lazy, `src/client.ts` singleton, `src/index.ts` barrel, `prisma.config.ts` (import.meta.dirname + databaseUrl()), `.env` copiado (idêntico ao .env.example), docker-compose.yml presente
- [x] NENHUM bug do template revelado → zero correções em `scripts/harness/templates/prisma`, `init.js` ou `init.test.js`
- [x] `pnpm harness check` limpo

## Handoff (task 19 — teste real E2E do template database --prisma)
- Feito: pipeline completo exercitado num projeto real gerado por `harness init --prisma`
  (`C:\Users\anton\AppData\Local\Temp\opencode\e2e-prisma`): typecheck do package,
  turbo typecheck do monorepo (5 packages), `prisma migrate dev --name init` aplicado no
  Postgres do container (`20260930034639_init`; tabelas `tenants` e `scoped_records` com
  índices tenantId), `prisma db seed` idempotente (2x → 1 linha `tenant-default`), build
  tsup exercitado via import direto de `dist/index.js` com leitura real do tenant
  (singleton + PrismaPg OK). Estrutura 100% alinhada ao padrão diasbellazzi (exports map,
  config lazy, client singleton, barrel, prisma.config.ts com import.meta.dirname +
  databaseUrl(), .env copiado, docker-compose.yml). Nenhum ajuste necessário no template.
- Pendências: 1) o import `@saas/database` por nome de package não pôde ser exercitado no
  temp porque o node_modules de lá está parcial (sem symlinks `@saas/*`) — limitação do
  ambiente de teste, não do template; o runtime foi validado via bundle dist + o typecheck
  validou o caminho `types` do exports map. 2) sessão órfã da tentativa anterior segurava
  advisory lock de migração (P1002) — resolvido terminando o PID 106 no container.
- Decisões: `prisma migrate dev --name init` é a forma não-interativa de migrar (evita o
  prompt de nome); o P1002 (advisory lock timeout) não é bug do template e sim resíduo de
  sessão interrompida — limpar `pg_stat_activity`/`pg_locks` antes de retentar.

## Handoff (task 18 — cleanup newline final template database)
- Feito: `\n` final adicionado (append-only, `printf '\n' >>`) nos 8 arquivos do escopo —
  `packages/database/{package.json, prisma.config.ts, src/index.ts, src/config.ts,
  src/client.ts, tsconfig.json, prisma/seed.ts}` e `tests/init.test.js`. Regressão cosmética
  apontada pelo reviewer no gate final do lote (os originais tinham newline; os
  reescritos/novos perderam). Nenhum outro conteúdo alterado.
- Pendências: nenhuma.
- Decisões: operação estritamente append-only (nenhum arquivo reescrito); validação via
  `tail -c 1 | od -An -c` antes/depois + `git diff` restrito aos arquivos do escopo.

## Handoff (task 16 — template database alinhado ao padrão diasbellazzi)
- Feito: template `packages/prisma` → `packages/database` (`@saas/database`) via `git mv`;
  package.json no padrão diasbellazzi (build tsup node22, exports map, postinstall generate);
  `src/config.ts` (`databaseUrl()` lazy), `src/client.ts` (singleton + `TenancyMiddleware`),
  `src/index.ts` barrel, `prisma.config.ts` (`import.meta.dirname` + `databaseUrl()` + seed),
  `prisma/seed.ts` (upsert Tenant demo com guarda de produção), `tsconfig.json` com
  `prisma.config.ts` no include; referências atualizadas em `init.js`, `module.js`, `ci.yml`;
  `.gitignore` ignora `packages/database/src/generated/`; teste smoke `init --prisma` em
  `tests/init.test.js`. `schema.prisma`, `.env.example` e `docker-compose.yml` intocados.
  Validação: grep `@saas/prisma|packages/prisma` em `scripts` e `context` (fora do doc da task)
  → zero; `pnpm test` 70/70 (inclui o smoke novo); `pnpm harness check` limpo.
- Pendências: ~~`README.md` (linhas 108 e 130) ainda referencia `packages/prisma`~~ — resolvido na
  task 17 (2 ocorrências trocadas para `packages/database`; `grep` limpo e `harness check` ok).
- Decisões: `databaseUrl()` é função lazy (não const) para o dotenv do `prisma.config.ts`
  rodar antes da leitura (ordem de avaliação ESM); `prisma.config.ts` usa `import.meta.dirname`
  (Node 22 ESM) porque `__dirname` não existe em ESM e quebraria o typecheck com o novo
  tsconfig; o documento da task em `context/agents/` mantém as referências antigas
  (registro histórico do que foi pedido — não é código e não deve ser reescrito).

## Histórico de handoffs
### Nenhum anterior
- Módulo criado na task 16.

## Handoff (task 17 — corrigir README refs packages/prisma)
- Feito: `README.md` linhas 108 e 130 — `packages/prisma` → `packages/database` na descrição
  da flag `--prisma` do `harness init` e no passo "Inicializar". Nenhum outro arquivo tocado
  (só `README.md` + `status.md` deste módulo, coberto pelo escopo `context/`).
- Pendências: nenhuma.
- Decisões: refs antigas em docs históricas de tasks (`done/16-*`, `active/17-*`, seções de
  histórico do próprio status.md) foram mantidas — são registro histórico do que foi pedido,
  não código (mesmo critério da task 16).