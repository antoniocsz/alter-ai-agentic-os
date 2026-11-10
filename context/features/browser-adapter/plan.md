# Plano: browser-adapter

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-09.

## Abordagem

- Reuso da máquina de adaptadores: `scripts/harness/src/lib/adapters.js` (template/diretórios por tool) + `adapter.js` (comando). O subcaso `browser` escreve os blocos de MCP por tool a partir de template de `lib/templates.js`.
- **Injeção segura de JSON:** arquivo ausente → escreve JSON canônico; arquivo presente, apenas se `JSON.parse` certo e sem key "mcp"/"mcpServers" em conflito — caso contrário, fail-safe (print do bloco + exit ≠ 0). `opencode.json` pode ter JSONC (comentários) → nesse caso: no-op com instrução manual em vez de parse forçado. Nada sobrescrito nunca.
- **Playwright MCP via npx** (`npx @playwright/mcp@latest`): zero dependência; referência em template e em `.agents/browser.md`.
- `.agents/browser.md` fichada nos assets compartilhados (copiada por `update`/`init`, como as demais refs de `.agents/`).
- `--tools` do init valida lista (opencode, claude, codex, browser) e despacha a instalação browser no scaffold.

## Módulos e arquivos afetados

- `scripts/harness/src/adapter.js` — subcomando/caso `browser`
- `scripts/harness/src/lib/adapters.js` — definição da camada browser (arquivos-alvo por tool)
- `scripts/harness/src/lib/templates.js` — blocos MCP por tool (opencode.json, .mcp.json, codex)
- `scripts/harness/src/init.js` — flag `tools` aceitando `browser`
- `adapters/browser/` — novo diretório com o template base (paridade com claude/codex/opencode)
- `.agents/browser.md` — nova referência (fonte do workspace, entregue nos projetos)
- `scripts/harness/tests/adapter-browser.test.js` — novo (idempotência, fail-safe, preservação)

## Ordem de tasks

1. `83-backend-browser-adapter.md` — única task de implementação. depende de: —

## Riscos

- `opencode.json` com JSONC/comentários → nunca parsear agressivamente: no-op guiado em vez de corromper.
- Nome versão em npx (`@latest`) travar reproducibilidade → parametrizável via flag `--browser-package` (default `@playwright/mcp@latest`), documentado em .agents/browser.md.
- Projetos antigos sem .mcp.json → o comando cria o arquivo, preservando nada além do que próprio cria.
