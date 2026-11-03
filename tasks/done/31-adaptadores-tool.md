# Task: Adaptadores de tool (OpenCode, Claude Code, Codex) (Fase 6)
## Agente: `coordinator` (arquitetura multi-tool)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `core/`
- `adapters/`
- `scripts/harness/src/lib/adapters.js`
- `scripts/harness/src/adapter.js`
- `scripts/harness/src/init.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/adapters.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 30-memoria-local.md
## Contexto para ler: plano v0.3 (D5 core neutro + adaptadores, F6)
## Skills a carregar: codegen.md
## O que já existe:
- `.opencode/agent/` com 5 agents (backend/frontend/mobile/coordinator/reviewer) copiados no init.
- Nenhuma camada Claude/Codex; skills/commands apenas citados no plano.
## O que criar:
- `core/`: papéis neutros (coordinator, executor, reviewer) independentes de tool.
- `adapters/shared/`: skills (mem-search, spec-driven) e commands (status, recall, handoff, worktree).
- `adapters/opencode`: agentes existentes + skills/commands renderizados.
- `adapters/claude`: `CLAUDE.md` (@AGENTS.md), `.claude/agents`, `.claude/skills`, `.claude/commands`, `settings.json` com deny de operações destrutivas.
- `adapters/codex`: `.codex/prompts` + README de instalação.
- `harness adapter <tool>` + `init --tools opencode,claude,...` (default opencode).
## Especificação:
- Adapters são saída gerada e deletável; nada de valor mora neles.
- Trocar de tool no meio não perde estado (pipeline e memória estão no disco).
- Permissões de sandbox: Claude `settings.json` nega reset/checkout/rm -rf; OpenCode mantém
  `edit: deny` no reviewer (já existente).
## Critério de conclusão:
- [ ] `init --tools claude` gera CLAUDE.md + .claude/*
- [ ] `harness adapter codex` gera .codex/prompts
- [ ] `harness adapter list` lista as tools
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 31-adaptadores-tool.md --handoff "<resumo>"`
## Complexidade: alta

## Baseline (git)
- scripts/harness/src/commands/index.js
- scripts/harness/src/init.js
- adapters/claude/.claude/agents/coordinator.md
- adapters/claude/.claude/agents/executor.md
- adapters/claude/.claude/agents/reviewer.md
- adapters/claude/.claude/settings.json
- adapters/claude/CLAUDE.md.tpl
- adapters/codex/.codex/README.md
- adapters/codex/.codex/prompts/handoff.md
- adapters/codex/.codex/prompts/recall.md
- adapters/codex/.codex/prompts/status.md
- adapters/shared/command/handoff.md
- adapters/shared/command/recall.md
- adapters/shared/command/status.md
- adapters/shared/command/worktree.md
- adapters/shared/skill/mem-search/SKILL.md
- adapters/shared/skill/spec-driven/SKILL.md
- core/README.md
- core/coordinator.md
- core/executor.md
- core/reviewer.md
- scripts/harness/src/adapter.js
- scripts/harness/src/lib/adapters.js
- scripts/harness/tests/adapters.test.js
- tasks/queue/31-adaptadores-tool.md
