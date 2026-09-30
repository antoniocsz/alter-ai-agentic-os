# Task: Corrigir README refs packages/prisma
## Agente: `backend`
## Módulo: `template-prisma`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/template-prisma/context.md (módulo do harness; ver status.md — task 16 renomeou packages/prisma → packages/database)
## Skills a carregar: codegen.md + backend.md
## O que já existe: a task 16 (done/) renomeou o template `packages/prisma` → `packages/database` (package `@saas/prisma` → `@saas/database`) e atualizou todas as referências em código (init.js, module.js, ci.yml). O `README.md` (linhas 108 e 130) ficou desatualizado — ainda cita `packages/prisma` na descrição da flag `--prisma`.
## O que criar:
- Nenhum arquivo novo. Corrigir apenas as 2 ocorrências de `packages/prisma` no `README.md`:
## Especificação:
- Linha ~108: trocar `packages/prisma` por `packages/database` na descrição da flag `--prisma` do `harness init`.
- Linha ~130: trocar `packages/prisma` (schema + client) por `packages/database` (schema + client) no passo "Inicializar".
- Manter o restante do texto intacto. Não tocar em nenhum outro arquivo.
## Critério de conclusão:
- [ ] `grep -n "packages/prisma" README.md` → zero resultados
- [ ] Apenas `README.md` modificado no git status
- [ ] `pnpm harness check` limpo
## Ao terminar: rodar `pnpm harness finish 17-corrigir-readme-refs-packages-prisma.md` e registrar handoff
## Complexidade: baixa

## Baseline (git)
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
- context/agents/queue/17-corrigir-readme-refs-packages-prisma.md
- context/modules/template-prisma/context.md
- context/modules/template-prisma/status.md
- scripts/harness/templates/prisma/packages/database/prisma/seed.ts
- scripts/harness/templates/prisma/packages/database/src/client.ts
- scripts/harness/templates/prisma/packages/database/src/config.ts
