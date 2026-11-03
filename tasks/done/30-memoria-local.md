# Task: Memória local — session/recall/status (Fase 5)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/session.js`
- `scripts/harness/src/recall.js`
- `scripts/harness/src/status.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/memory.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 29-motor-gates.md
## Contexto para ler: plano v0.3 (D6 memória local, substituir claude-mem, F5)
## Skills a carregar: codegen.md
## O que já existe:
- SQLite com tasks/task_events/interactions; `context/sessions/` no template base.
- claude-mem externo (MCP) sem dependência no código do kit.
## O que criar:
- Tabela `sessions` (id, project, date, summary, created_at).
- `harness session end "<resumo>"` → grava no db + `context/sessions/YYYY-MM-DD-<slug>.md`.
- `harness session list [--limit n]`.
- `harness recall "<termo>" [--limit n] [--json]` → busca no db (sessions/interactions/events/tasks)
  e no markdown (context/, tasks/); agrega em workspace quando rodado na raiz.
- `harness status` → WIP, ativas, worktrees, próximas da queue, últimas sessões e handoff.
## Especificação:
- Zero dependência externa; nada de provider/tokens.
- Busca case-insensitive, resultado compacto (fonte + trecho), limite padrão.
- `status` na raiz do workspace lista os projetos (não entra em loop de sessão).
## Critério de conclusão:
- [ ] session end/list persistem e listam
- [ ] recall acha sessões, tasks e notas
- [ ] status resume o projeto e o workspace
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 30-memoria-local.md --handoff "<resumo>"`
## Complexidade: alta

## Baseline (git)
- scripts/harness/src/commands/index.js
- scripts/harness/src/lib/db.js
- scripts/harness/src/lib/memory.js
- scripts/harness/src/recall.js
- scripts/harness/src/session.js
- scripts/harness/src/status.js
- scripts/harness/tests/memory.test.js
- tasks/queue/30-memoria-local.md
