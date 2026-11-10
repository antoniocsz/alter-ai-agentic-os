# .agents/browser.md
# Carregar quando a task pedir navegador (validar UI gerada, screenshots, inspecionar página)

## Quando usar navegador em task

- Validar UI gerada por uma task de frontend — fluxo crítico da spec ou critério de
  aceitação que só se prova em runtime (screenshots, console, network).
- Inspecionar página/tabs/snapshot antes de um handoff de UI.
- Reproduzir bug relatado que exige interação real com a página.

Se a task não pede validação visual nem interação com página, **não** abra navegador.

## Config por tool (instalada pelo harness)

```
harness adapter browser <tool>    # tool ∈ opencode | claude | codex
```

| tool    | onde a config vive                                | como chega lá                      |
|---------|---------------------------------------------------|------------------------------------|
| opencode| `opencode.json` (raiz) → `mcp.browser`            | `harness adapter browser opencode` |
| claude  | `.mcp.json` (raiz) → `mcpServers.browser`         | `harness adapter browser claude`   |
| codex   | `~/.codex/config.toml` (instrução em `.codex/prompts/browser.md`) | `harness adapter browser codex` |

- Server: **Playwright MCP** (`@playwright/mcp@latest`) via `npx` — o harness não instala
  nada (guard rail 4: zero deps; a 1ª execução baixa o pacote no cache do npx).
- Flag opcional `--browser-package <pkg>` troca o pacote/snapshot.

## Guard rails

- **Só superfícies da task** — navegue no projeto atual (dev server/preview da própria app)
  e em URLs de verificação declaradas na task. Nada de login externo, checkout real ou
  qualquer conta de produção.
- **Screenshots em `.tmp/`** (gitignored) — delete ao terminar a task; não versionar,
  não jogar em `context/`.
- **Zero mudanças estruturais** — navegar não autoriza `pnpm install`, editar
  `package.json`/lockfile ou alterar config global do agente.
- Config injetada é **idempotente** (`no-op` se o server "browser" já existe) e
  **fail-safe** (JSONC/comentários/estrutura inesperada → ninguém é sobrescrito: o
  harness imprime o bloco a fundir manualmente e falha).

## Limites por tool (matriz)

| tool    | o que é gerado                        | limite                                  |
|---------|---------------------------------------|-----------------------------------------|
| opencode| config MCP em `opencode.json`         | resto do arquivo preservado             |
| claude  | `.mcp.json` da raiz                   | resto do arquivo preservado             |
| codex   | `.codex/prompts/browser.md` (instrução)| server manual no `~/.codex/config.toml` |
