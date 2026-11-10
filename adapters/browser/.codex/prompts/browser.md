Instrução para habilitar o browser (Playwright MCP) no Codex.

O Codex não usa `.mcp.json` (formato do Claude) nem `opencode.json` — o server de MCP
vai no `~/.codex/config.toml`:

```toml
# ~/.codex/config.toml
[mcp_servers.browser]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

Recarregada a sessão do Codex, as tools de browser ficam disponíveis para validar UI
gerada, inspecionar páginas e tirar screenshots — sempre respeitando `AGENTS.md` e
`.agents/browser.md` (só superfícies declaradas no ## Escopo da task; screenshots em
`.tmp/`).

A execução é por `npx` sob demanda: nada é instalado no projeto (zero dependências) —
o pacote baixa no primeiro uso do agente e fica no cache do npx.
