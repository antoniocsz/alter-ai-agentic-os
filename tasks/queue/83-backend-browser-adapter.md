# Task: Adapter browser — MCP Playwright por tool
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Feature: browser-adapter
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/adapter.js`
- `scripts/harness/src/lib/adapters.js`
- `scripts/harness/src/lib/templates.js`
- `scripts/harness/src/init.js` (aceitar `browser` em `--tools`)
- `adapters/browser/` (NOVO diretório, paridade com claude/codex/opencode)
- `.agents/browser.md` (NOVO)
- `scripts/harness/tests/adapter-browser.test.js` (NOVO)
## Depende de: —
## Contexto para ler: context/modules/harness/context.md · context/features/browser-adapter/spec.md · scripts/harness/src/adapter.js · scripts/harness/src/lib/adapters.js
## Skills a carregar: codegen.md
## O que já existe:
- `harness adapter opencode|claude|codex` instala a camada de instruções por tool (botões em `adapters/<tool>/`)
- `adapter list` lista camadas; `init --tools opencode,claude` já valida lista de tools
- Playwright MCP corre via `npx @playwright/mcp@latest` — SEM dependência no harness (guard rail 4; AC-8)
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `harness adapter browser <tool>`: opencode → entry MCP no `opencode.json`; claude → entry no `.mcp.json`; codex → instrução documentada (sem .mcp.json); flag opcional `--browser-package` (default `@playwright/mcp@latest`)
- Injeção segura: arquivo ausente → JSON canônico novo; existe e parse certo e sem conflito → insere preservando resto; JSONC/comentários ou conflito → no-op que não toca arquivo, imprime bloco p/ merge manual, exit ≠ 0; server "browser" já presente → idempotente (exit 0)
- `harness adapter list` mostra camada `browser`; `init --tools ... browser` instala no scaffold
- `.agents/browser.md`: quando usar navegador em task, guard rails (só superfícies da task; screenshots em `.tmp/`), matriz por tool
## Especificação:
- Comando sem `<tool>` → ajuda de uso (exit 0, lista as tools e o que escreve em cada)
- Nunca instalar nada: zero mudanças em package.json/lockfile (AC-8); npx resolve na 1ª execução do agente
## Critério de conclusão:
- [ ] Testes: idempotência (2ª execução = no-op), preservação de entries existentes, fail-safe de JSONC (arquivo intacto, exit ≠ 0), `list` inclui browser
- [ ] `node --test` verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 83`
## Complexidade: média
## Baseline (git): main (queue planejada 2026-11-09)
