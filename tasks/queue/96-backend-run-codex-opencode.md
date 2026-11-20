# Task: Execução de agentes — drivers Codex e OpenCode
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Feature: execucao-agentes
## ACs: AC-7, AC-8
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/codex.js`
- `scripts/harness/src/lib/runtimes/opencode.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/run-codex-opencode.test.js`
- `scripts/harness/tests/fixtures/runtimes/codex`
- `scripts/harness/tests/fixtures/runtimes/opencode`

Anotações do escopo: drivers e teste novos; `run.js` só passa a aceitar `--tool codex|opencode` (registro de drivers).
## Depende de: 94
## Contexto para ler: context/features/execucao-agentes/plan.md · scripts/harness/src/lib/runtimes/claude.js (contrato do driver) · https://developers.openai.com/codex/noninteractive · https://opencode.ai/docs/cli
## Skills a carregar: codegen.md + security.md
## O que já existe:
- Runner + contrato de driver + driver Claude (task 94)
- Perfis de sandbox: Codex não reforça deny (documentado na task 87); OpenCode `run` aprova permissões automaticamente
## O que criar:
- `runtimes/codex.js` → `codex exec --json <prompt>` (cwd = worktree); normalize: `thread.started` → `run.started` (+session), `item.completed` agent_message → `agent.message`, command_execution → `agent.tool_call`/`tool_result`, file_change → `agent.file_changed`, mcp_tool_call → `agent.tool_call`, `turn.completed` usage → `agent.usage` (measured), `turn.failed`/`error` → `agent.error`
- `runtimes/opencode.js` → `opencode run --format json <prompt>`; normalize por `type` do NDJSON, `sessionID` → session; usage quando presente
- `run.js` → registro dos drivers; `--tool opencode` exige `--unsafe` (aprovação automática da tool) com aviso explícito
## Especificação:
- Conferir flags e formatos na doc oficial na implementação; registrar URL + data no driver e a versão detectada no run
- Evento desconhecido → `agent.message` com `native` (nunca descartado)
## Critério de conclusão:
- [ ] Transcrições gravadas de Codex e OpenCode → eventos normalizados esperados — teste
- [ ] OpenCode sem `--unsafe` recusa com mensagem clara — teste
- [ ] Execução REAL de cada tool instalada numa task de exemplo, anexada ao handoff (tool não instalada: registrar como pendência, não simular)
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 96`
## Complexidade: média
