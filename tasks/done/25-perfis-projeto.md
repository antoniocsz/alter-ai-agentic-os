# Task: Perfis de projeto (init --profile) + comando profile (Fase 2)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/profiles.js`
- `scripts/harness/src/init.js`
- `scripts/harness/src/profile.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/templates/project`
- `scripts/harness/tests/init.test.js`
- `AGENTS.md`
- `README.md`
- `.gitignore`
## Depende de: [x] 24-agents-neutro.md
## Contexto para ler: plano v0.3 (perfis, harness.json); templates atuais
## Skills a carregar: codegen.md
## O que já existe:
- `templates/project` era um único monorepo web.
- `init` sem escolha de perfil (exceto `--bare` que só limpava módulos).
## O que criar:
- Templates separados em `_base/` + perfis (`web`, `api`, `cli`, `script`, `game`, `docs`, `design`, `bare`).
- `init --profile <p>` (default web; `--bare` = perfil bare) copiando base + overlay do perfil.
- Comando `harness profile` listando perfis (e detalhes de um perfil).
- Regra de arquivos temporários no AGENTS.md (guard rail 8) e `.tmp/` no .gitignore.
## Especificação:
- Não quebrar `init` default (web) nem `--bare`.
- `--prisma` só é válido para `web`/`api`.
- `harness.json` do perfil renderizado no projeto.
- `--profile` inválido falha com lista de perfis.
## Critério de conclusão:
- [ ] `harness init --profile script|docs|api` gera esqueleto correto
- [ ] Projeto gerado por qualquer perfil passa no `harness check`
- [ ] `harness profile` lista os 8 perfis
- [ ] Regra de temporários documentada e `.tmp/` ignorado
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 25-perfis-projeto.md --handoff "<resumo>"`
## Complexidade: alta

## Baseline (git)
- .gitignore
- AGENTS.md
- README.md
- scripts/harness/src/commands/index.js
- scripts/harness/src/init.js
- scripts/harness/templates/project/_base/.gitignore
- scripts/harness/templates/project/_base/context/project/adr/ADR-000-template.md
- scripts/harness/templates/project/_base/context/project/overview.md
- scripts/harness/templates/project/_base/context/project/stack.md
- scripts/harness/templates/project/_base/opencode.json
- scripts/harness/templates/project/_base/tasks/active/.gitkeep
- scripts/harness/templates/project/_base/tasks/done/.gitkeep
- scripts/harness/templates/project/web/.github/workflows/ci.yml
- scripts/harness/templates/project/web/.npmrc
- scripts/harness/templates/project/web/README.md
- scripts/harness/templates/project/web/apps/api/package.json
- scripts/harness/templates/project/web/apps/api/src/cache.ts
- scripts/harness/templates/project/web/apps/api/src/server.spec.ts
- scripts/harness/templates/project/web/apps/api/src/server.ts
- scripts/harness/templates/project/web/apps/api/tsconfig.json
- scripts/harness/templates/project/web/apps/web/next.config.ts
- scripts/harness/templates/project/web/apps/web/package.json
- scripts/harness/templates/project/web/apps/web/src/app/globals.css
- scripts/harness/templates/project/web/apps/web/src/app/layout.tsx
- scripts/harness/templates/project/web/apps/web/src/app/page.tsx
- scripts/harness/templates/project/web/apps/web/src/app/providers.tsx
- scripts/harness/templates/project/web/apps/web/tsconfig.json
- scripts/harness/templates/project/web/context/modules/audit/context.md
- scripts/harness/templates/project/web/context/modules/audit/status.md
- scripts/harness/templates/project/web/context/modules/auth/context.md
- scripts/harness/templates/project/web/context/modules/auth/status.md
- scripts/harness/templates/project/web/context/modules/authorization/context.md
- scripts/harness/templates/project/web/context/modules/authorization/status.md
- scripts/harness/templates/project/web/context/modules/tenancy/context.md
- scripts/harness/templates/project/web/context/modules/tenancy/status.md
- scripts/harness/templates/project/web/eslint.config.js
- scripts/harness/templates/project/web/harness.json
- scripts/harness/templates/project/web/package.json
- scripts/harness/templates/project/web/packages/api-client/package.json
- scripts/harness/templates/project/web/packages/api-client/src/index.ts
- scripts/harness/templates/project/web/packages/api-client/tsconfig.json
- scripts/harness/templates/project/web/packages/contracts/package.json
- scripts/harness/templates/project/web/packages/contracts/src/index.ts
- scripts/harness/templates/project/web/packages/contracts/tsconfig.json
- scripts/harness/templates/project/web/packages/modules/.gitkeep
- scripts/harness/templates/project/web/pnpm-workspace.yaml
- scripts/harness/templates/project/web/tasks/queue/01-module-tenancy.md
- scripts/harness/templates/project/web/tasks/queue/02-module-authorization.md
- scripts/harness/templates/project/web/tasks/queue/03-module-auth.md
- scripts/harness/templates/project/web/tasks/queue/04-module-audit.md
- scripts/harness/templates/project/web/tsconfig.base.json
- scripts/harness/templates/project/web/turbo.json
- scripts/harness/templates/project/web/vitest.config.ts
- scripts/harness/tests/init.test.js
- scripts/harness/tests/workspace.test.js
- scripts/harness/src/lib/profiles.js
- scripts/harness/src/profile.js
- scripts/harness/templates/project/_base/README.md
- scripts/harness/templates/project/_base/context/features/.gitkeep
- scripts/harness/templates/project/_base/context/modules/.gitkeep
- scripts/harness/templates/project/_base/context/sessions/.gitkeep
- scripts/harness/templates/project/_base/tasks/queue/.gitkeep
- scripts/harness/templates/project/api/.github/workflows/ci.yml
- scripts/harness/templates/project/api/.npmrc
- scripts/harness/templates/project/api/apps/api/package.json
- scripts/harness/templates/project/api/apps/api/src/cache.ts
- scripts/harness/templates/project/api/apps/api/src/server.spec.ts
- scripts/harness/templates/project/api/apps/api/src/server.ts
- scripts/harness/templates/project/api/apps/api/tsconfig.json
- scripts/harness/templates/project/api/eslint.config.js
- scripts/harness/templates/project/api/package.json
- scripts/harness/templates/project/api/packages/contracts/package.json
- scripts/harness/templates/project/api/packages/contracts/src/index.ts
- scripts/harness/templates/project/api/packages/contracts/tsconfig.json
- scripts/harness/templates/project/api/pnpm-workspace.yaml
- scripts/harness/templates/project/api/tsconfig.base.json
- scripts/harness/templates/project/api/turbo.json
- scripts/harness/templates/project/api/vitest.config.ts
- scripts/harness/templates/project/bare/.gitkeep
- scripts/harness/templates/project/bare/harness.json
- scripts/harness/templates/project/cli/README.md
- scripts/harness/templates/project/cli/bin/cli.js
- scripts/harness/templates/project/cli/harness.json
- scripts/harness/templates/project/cli/package.json
- scripts/harness/templates/project/cli/src/index.js
- scripts/harness/templates/project/cli/tests/cli.test.js
- scripts/harness/templates/project/design/BRIEF.md
- scripts/harness/templates/project/design/assets/.gitkeep
- scripts/harness/templates/project/design/harness.json
- scripts/harness/templates/project/docs/README.md
- scripts/harness/templates/project/docs/docs/.gitkeep
- scripts/harness/templates/project/docs/docs/index.md
- scripts/harness/templates/project/docs/harness.json
- scripts/harness/templates/project/game/assets/.gitkeep
- scripts/harness/templates/project/game/harness.json
- scripts/harness/templates/project/game/package.json
- scripts/harness/templates/project/game/src/scenes/.gitkeep
- scripts/harness/templates/project/game/src/systems/.gitkeep
- scripts/harness/templates/project/game/tests/.gitkeep
- scripts/harness/templates/project/game/tests/smoke.test.js
- scripts/harness/templates/project/script/harness.json
- scripts/harness/templates/project/script/package.json
- scripts/harness/templates/project/script/src/main.js
- scripts/harness/templates/project/script/tests/main.test.js
- tasks/queue/25-perfis-projeto.md
