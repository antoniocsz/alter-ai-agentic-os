# Task: conversa continua com o agente (run --continue + api)
## Agente: `backend`
## Módulo: `harness`
## Feature: conversa-continua
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/conversation.js`
- `scripts/harness/src/lib/runtimes/claude.js`
- `scripts/harness/src/lib/runtimes/codex.js`
- `scripts/harness/src/lib/runtimes/opencode.js`
- `scripts/harness/src/lib/runtimes/gemini.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/conversation.test.js`
- `scripts/harness/tests/runs.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-chat-agent.js`
- `README.md`
- `AGENTS.md`
- `context/modules/harness/status.md`
- `context/features/conversa-continua/spec.md`
- `context/features/conversa-continua/plan.md`
## Depende de: —
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: drivers gravam `session_id` (meta.sessionId) em `runs`; runs são avulsos.
## O que criar:
- `scripts/harness/src/lib/conversation.js` → validação da mensagem, run a continuar, prompt da continuação, conversa da task
- `scripts/harness/tests/conversation.test.js` + `fixtures/runtimes/fake-chat-agent.js` → testes CLI e API
## Especificação: ver context/features/conversa-continua/spec.md (AC-1..AC-5) e plan.md.
## Critério de conclusão:
- [ ] `harness run <task> --continue --message` retoma a sessão (claude/codex/opencode) com parent_run_id e user.message
- [ ] `POST /api/runs` com continue+message e `GET /api/conversation` funcionando
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 139-conversa-continua-com-o-agente-run-continue-api.md`
## Complexidade: média

## Baseline (git)
- context/features/conversa-continua/plan.md
- context/features/conversa-continua/spec.md
- tasks/queue/139-conversa-continua-com-o-agente-run-continue-api.md
