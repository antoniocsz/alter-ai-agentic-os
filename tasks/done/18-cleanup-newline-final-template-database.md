# Task: Cleanup newline final template database
## Agente: `backend`
## Módulo: `template-prisma`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/prisma/packages/database/package.json`
- `scripts/harness/templates/prisma/packages/database/prisma.config.ts`
- `scripts/harness/templates/prisma/packages/database/src/index.ts`
- `scripts/harness/templates/prisma/packages/database/src/config.ts`
- `scripts/harness/templates/prisma/packages/database/src/client.ts`
- `scripts/harness/templates/prisma/packages/database/tsconfig.json`
- `scripts/harness/templates/prisma/packages/database/prisma/seed.ts`
- `scripts/harness/tests/init.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/template-prisma/status.md (Fase 3 — task 16 renomeou o template; reviewer apontou o nit)
## Skills a carregar: codegen.md + backend.md
## O que já existe: 8 arquivos sem newline final (`\n`) — regressão cosmética apontada pelo reviewer no gate final do lote (os originais tinham newline; os reescritos/novos perderam).
## O que criar:
- Nenhum arquivo novo. Apenas adicionar `\n` final nos 8 arquivos listados no ## Escopo.
## Especificação:
- Para cada arquivo do escopo: garantir que o último byte seja `\n` (adicionar uma quebra de linha final se ausente).
- Não alterar NENHUM outro conteúdo (nada de reformatação, reordenação ou mudança de valores).
- Verificar antes/depois com: `tail -c 1 <arquivo> | od -An -c` → deve terminar em `\n`.
- Ao terminar, rodar `pnpm test` (deve continuar 70/70) e `pnpm harness check`.
## Critério de conclusão:
- [ ] Os 8 arquivos terminam em `\n` (verificado com od)
- [ ] `git diff` mostra APENAS a adição de `\n` no fim de cada arquivo (sem outras mudanças)
- [ ] `pnpm test` → 70/70
- [ ] `pnpm harness check` limpo
## Ao terminar: rodar `pnpm harness finish 18-cleanup-newline-final-template-database.md` e registrar handoff
## Complexidade: baixa

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
- context/agents/queue/18-cleanup-newline-final-template-database.md
- context/agents/queue/19-teste-real-e2e-do-template-database-prisma.md
- context/modules/template-prisma/context.md
- context/modules/template-prisma/status.md
- kanban.html
- scripts/harness/templates/prisma/packages/database/prisma/seed.ts
- scripts/harness/templates/prisma/packages/database/src/client.ts
- scripts/harness/templates/prisma/packages/database/src/config.ts
