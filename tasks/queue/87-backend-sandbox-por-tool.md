# Task: Sandbox por tool — perfis de permissão declarados
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Feature: sandbox-por-tool
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/adapters.js`
- `scripts/harness/src/adapter.js` (flag `--sandbox` + perfil no `list`)
- `adapters/claude/` (template settings.json)
- `adapters/opencode/` (frontmatter de permissions dos agents)
- `adapters/codex/` (seção sandbox documentada)
- `.agents/sandbox.md` (NOVO)
- `scripts/harness/tests/adapter-sandbox.test.js` (NOVO)
## Depende de: 83-backend-browser-adapter.md
## Contexto para ler: context/modules/harness/context.md · context/features/sandbox-por-tool/spec.md · scripts/harness/src/lib/adapters.js · adapters/claude/ (settings atual)
## Skills a carregar: codegen.md
## O que já existe:
- Adaptadores claude/opencode/codex funcionando (tasks 31 e 68); settings.json do claude já nega alguns comandos destrutivos; reviewer opencode roda com `edit: deny`
- Matriz de capacidades por tool no README (manutenção fica na task 89 — não tocar README nesta task)
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `lib/adapters.js` → `SANDBOX_PROFILES`: `minimal` (default) e `strict` (superset), deny **por prefixo de comando**; allow explícito de `pnpm harness*` e `node scripts/harness*`
  - minimal: `git reset*`, `git checkout*`, `git restore*`, `git clean*`, `git push*`, `rm -rf*`, `sudo *`
  - strict: minimal + `pnpm install*`, `npm install*`, `expo install*`, `curl *`, `wget *`
- Templates por tool consomem o perfil: claude → `settings.json` allow/deny; opencode → frontmatter `permission:` dos agents (reviewer mantém `edit: deny`); codex → seção markdown honesta do que a tool reforça
- `adapter <tool> --sandbox strict|minimal` (default minimal) e `adapter list` mostrando o perfil
- `.agents/sandbox.md`: matriz de garantias harness × tool, tabela permissões, política de evolução (mudar deny ⇒ ADR); entregue em `init`/`update`
## Especificação:
- AC-6 é o teste de segurança mais importante: `pnpm harness worktree finish <task>` e `node scripts/harness/bin/harness.js ...` NÃO podem casar nos deny patterns
- Mudança de perfil NÃO altera comportamento do CLI do harness (gates/pipeline intactos)
## Critério de conclusão:
- [ ] Testes: strict ⊃ minimal; allow explícito do pipeline; templates das 3 tools coerentes com o perfil escolhido
- [ ] Zero regresão no adapter claude existente (settings válido JSON)
- [ ] `node --test` verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 87`
## Complexidade: média
## Baseline (git): main (queue planejada 2026-11-09)
