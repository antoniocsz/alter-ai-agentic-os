# Task: Docs de consolidação do ciclo (README, tool matrix, CHANGELOG, version 0.4.0)
## Agente: `backend` | Módulo: `harness` | Prioridade: P3 | Tipo: docs
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `context/modules/harness/status.md`
- `scripts/harness/package.json`
- `CHANGELOG.md`
- `AGENTS.md`

Anotações do escopo: status.md para o fecho do ciclo; package.json via `harness version --bump minor` (0.3.4 → 0.4.0); CHANGELOG via `harness changelog`; AGENTS.md para adicionar `browser.md` e `sandbox.md` na tabela "Índice de referências modulares" (penências das tasks 83/87/91). Detalhes em "O que criar".
## Depende de: 82-backend-rotinas-core.md, 83-backend-browser-adapter.md, 84-backend-canvas-dados.md, 85-backend-canvas-ui.md, 86-backend-serve-webhook.md, 87-backend-sandbox-por-tool.md, 88-backend-rotinas-ui.md
## Contexto para ler: README.md · context/modules/harness/status.md · context/features/*/spec.md · CHANGELOG.md
## Skills a carregar: codegen.md
## O que já existe (pós-lote):
- 4 features implementadas: `agent-canvas` (vista Execução), `rotinas` (serve/agendador/webhook/painel), `browser-adapter` (MCP Playwright), `sandbox-por-tool` (perfis minimal/strict)
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- README: seções novas — "Execução ao vivo (canvas)" (rota /canvas do `kanban --serve`), "Rotinas e `harness serve`" (routines.json, webhook+token, exemplo de rotina e de curl), "Adaptador browser" (uso + matriz de tool), "Sandbox por tool" (perfis minimal/strict, matriz de garantias), "Update sincroniza adapters" (marcador `.harness/adapters.json`) + index e matriz de capacidades por tool atualizadas
- AGENTS.md: adicionar `browser.md` e `sandbox.md` na tabela "Índice de referências modulares" (linhas: browser por MCP em task → `.agents/browser.md` · Permissões/sandbox por tool → `.agents/sandbox.md`)
- CHANGELOG: `harness changelog` regenerando a partir dos handoffs do ciclo; validar que as entradas do 82–88 aparecem
- Version: `harness version --bump minor` (0.3.4 → 0.4.0), citando o ciclo no log
- status.md: lote final com Feito/Pendências/Decisões/Revisado
## Especificação:
- Documentação segue o estilo existente do README (tabelas + blocos de exemplo); sem marketing; exemplos com os comandos reais do CLI
- Nada de código além da doc (nenhum .js fora do bump de versão)
## Critério de conclusão:
- [ ] README coerente com o que está implementado (nenhum comando citado fora de existir)
- [ ] CHANGELOG contém as entradas do ciclo; versão 0.4.0 registrada no banco (`harness version`)
- [ ] `harness check` ok
## Ao terminar: rodar `node scripts/harness/bin/harness.js finish 89` (handoff detalhado)
## Complexidade: baixa
## Baseline (git): main (queue planejada 2026-11-09)
