# Spec: browser-adapter

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: browser-adapter`.
> Criada em 2026-11-09.

## Problema

Agentes precisando de navegador (validar UI gerada, tirar screenshots, inspecionar página) dependem de MCP browser configurado por conta de cada projeto — sem mecanismo comum, cada adoção reinventa config em `opencode.json`, `.mcp.json` ou `config.toml`. O harness gera configs de tool (`adapter opencode|claude|codex`); faltar o **browser** como opção do mesmo mecanismo.

## Comportamento esperado

- `harness adapter browser <tool>` (tool ∈ opencode | claude | codex; sem tool → instrução de uso):
  - **opencode** → adiciona entry de MCP "browser" no `opencode.json` do projeto, apontando para o **Playwright MCP** executado via `npx` (ex.: server `browser` → `npx @playwright/mcp@latest`); demais entradas existentes preservadas.
  - **claude** → adiciona entry no `.mcp.json` da raiz (mesmo comando npx); demais preservadas.
  - **codex** → escreve instrução de MCP no elemento gerado do adaptador (config.toml comentado/prompts) — Codex não tem MCP via .mcp.json.
- **Idempotência e segurança de config:**
  - se o projeto já tem o server "browser" nesse arquivo → no-op com mensagem (exit 0).
  - se o arquivo existe e tem config mas **não** consegue ser lido/parseado sem risco → **não sobrescreve**: imprime o bloco a fundir e instrução manual (exit ≠ 0). Nada é destruído.
- `.agents/browser.md` (fonte, entregue por `update` em projetos): referência de uso — quando usar navegador em task, guard rails (só superfícies da task, screenshots em `.tmp/`), limites por tool (matriz).
- `harness adapter list` passa a listar a camada `browser` como disponível.
- `--tools` do init aceita `browser` (ex.: `--tools opencode,claude,browser`) instalando a config no scaffold gerado.
- **Sem dependência nova do harness**: o Playwright MCP roda via `npx` sob demanda (zero deps mantidas); nada é instalado pelo harness.

## Critérios de aceitação

- [ ] AC-1 — `harness adapter browser opencode` adiciona server MCP "browser" (Playwright via npx) no `opencode.json` preservando as entries existentes.
- [ ] AC-2 — `harness adapter browser claude` adiciona no `.mcp.json` da raiz (idem preservação); `codex` recebe instrução documentada, sem .mcp.json.
- [ ] AC-3 — invocação com server "browser" já presente no arquivo-alvo → no-op com mensagem (exit 0, idempotente).
- [ ] AC-4 — arquivo alvo existente, parseável mas não-casando a injeção segura → nenhum arquivo é tocado; bloco p/ merge manual impresso; exit ≠ 0.
- [ ] AC-5 — `harness adapter list` mostra `browser` como camada disponível por tool.
- [ ] AC-6 — `.agents/browser.md` existe na fonte do harness e é entregue em `update`/`init` nos projetos.
- [ ] AC-7 — `harness init <dir> --tools opencode,claude,browser` instala a config do browser no projeto gerado.
- [ ] AC-8 — nenhum `package.json`/lockfile do harness ou projeto é alterado pela feature (guard rail 4/zero deps).

## Fora de escopo

- Implementar/emitir browser próprio do harness (não é um Chromium embutido).
- Instalar o Playwright MCP ou Playwright browsers (runtime resolve via npx; primeira execução baixa o pacote).
- Integração do browser com kanban/canvas ou gravação de sessões de navegador no banco.
- Sandbox de rede/navegação no nível da tool (fica registrada em `.agents/browser.md` e nos perfis de sandbox).
