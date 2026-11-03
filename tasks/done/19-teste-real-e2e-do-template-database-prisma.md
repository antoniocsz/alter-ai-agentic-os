# Task: Teste real E2E do template database --prisma
## Agente: `backend`
## Módulo: `template-prisma`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/prisma`
- `scripts/harness/src/init.js`
- `scripts/harness/tests/init.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/template-prisma/status.md (tasks 16-18 done — template packages/database alinhado ao padrão diasbellazzi)
## Skills a carregar: codegen.md + backend.md + infra.md
## O que já existe: template `scripts/harness/templates/prisma` (packages/database, @saas/database) validado por testes unitários (smoke --prisma, 70/70) mas NUNCA exercitado de ponta a ponta: `harness init --prisma` → pnpm install → prisma generate → migrate → typecheck em um projeto real.
## O que criar:
- Nenhum arquivo novo no repo (validação externa em diretório temporário).
- SE o teste revelar bug no template, corrigir DENTRO do ## Escopo e reportar.
## Especificação:
1. **Projeto temp já existe** em `C:\Users\anton\AppData\Local\Temp\opencode\e2e-prisma` (criado via `harness init --prisma`; node_modules + generated/prisma + dist/ já validados). RETOMAR a partir deste estado — NÃO recriar, NÃO rodar `pnpm install` de novo.
2. **O container Postgres já está UP e healthy** (`e2e-prisma-postgres-1`, porta 5432, banco `e2e-prisma` criado). NÃO rodar `docker compose up` de novo.
3. Rodar no projeto temp (`workdir` = `C:\Users\anton\AppData\Local\Temp\opencode\e2e-prisma`) — **NUNCA comandos interativos; usar timeout explícito em tudo** (o travamento anterior foi o `prisma migrate dev` pedindo nome de migration):
   - `pnpm --filter @saas/database typecheck` (tsc --noEmit cobre src/**/*.ts + prisma.config.ts com import.meta.dirname)
   - `pnpm turbo typecheck` (monorepo inteiro)
   - `pnpm --filter @saas/database exec prisma migrate dev --name init` (com `--name` NÃO interativo; cria + aplica a migration no Postgres do container)
   - `pnpm --filter @saas/database exec prisma db seed` (roda `tsx prisma/seed.ts` configurado no prisma.config.ts — upsert do Tenant demo)
4. Validar a estrutura gerada vs. padrão diasbellazzi: package.json (name @saas/database, exports map), src/config.ts lazy, src/client.ts singleton, src/index.ts barrel, prisma.config.ts (import.meta.dirname + databaseUrl()), .env copiado, docker-compose.yml presente.
5. Reportar TODOS os achados: o que passou, o que falhou, e qualquer ajuste necessário no template (não aplicar correções além do escopo sem aprovação — mas correções do próprio template reveladas pelo teste SÃO o escopo).
## Critério de conclusão:
- [ ] typecheck do @saas/database OK (inclui prisma.config.ts)
- [ ] `pnpm turbo typecheck` do monorepo temp OK
- [ ] `prisma migrate dev --name init` aplicou a migration no Postgres (migrations/ criada + tabelas `tenants`/`scoped_records` existem)
- [ ] `prisma db seed` criou o Tenant demo (sem erro)
- [ ] build tsup já validado (dist/index.js existe) — confirmar
- [ ] Estrutura validada vs padrão diasbellazzi
- [ ] Se algo falhou: corrigido no template (dentro do escopo) OU reportado como pendência com evidência
- [ ] `pnpm harness check` do repo harness limpo após a task
## Ao terminar: rodar `pnpm harness finish 19-teste-real-e2e-do-template-database-prisma.md` e registrar handoff com o relatório completo
## Complexidade: media

## Baseline (git)
- README.md
- scripts/harness/src/init.js
- scripts/harness/src/module.js
- scripts/harness/templates/prisma/packages/database/package.json
- scripts/harness/templates/prisma/packages/database/prisma.config.ts
- scripts/harness/templates/prisma/packages/database/prisma/schema.prisma
- scripts/harness/templates/prisma/packages/database/src/index.ts
- scripts/harness/templates/prisma/packages/database/tsconfig.json
- scripts/harness/templates/project/.github/workflows/ci.yml
- scripts/harness/templates/project/.gitignore
- scripts/harness/tests/init.test.js
- context/agents/done/16-template-database-alinhado-ao-padrao-diasbellazz.md
- context/agents/done/17-corrigir-readme-refs-packages-prisma.md
- context/agents/done/18-cleanup-newline-final-template-database.md
- context/agents/queue/19-teste-real-e2e-do-template-database-prisma.md
- context/modules/template-prisma/context.md
- context/modules/template-prisma/status.md
- kanban.html
- scripts/harness/templates/prisma/packages/database/prisma/seed.ts
- scripts/harness/templates/prisma/packages/database/src/client.ts
- scripts/harness/templates/prisma/packages/database/src/config.ts
