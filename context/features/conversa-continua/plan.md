# Plano: conversa-continua

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- Drivers: `supportsResume` + opção `resume` em `command()` (claude, codex, opencode); gemini `false`.
- `lib/conversation.js` (novo): `validateMessage`, `resolveContinuation`, `buildContinuePrompt`, `conversationOf`.
- `runs.parent_run_id` (ALTER idempotente) e evento `user.message`; `runTool` recebe `parentRunId`/`userMessage`.
- `run.js`: `prepareContinue` (mesmas regras do `prepareRun`) e `--continue/--message` no CLI.
- `runs-api.js`: `continue`/`message` no `POST /api/runs`, `GET /api/conversation`.

## Módulos e arquivos afetados

- novos: `lib/conversation.js`, `tests/conversation.test.js`, fixture `fake-chat-agent.js`
- `lib/runtimes/{claude,codex,opencode,gemini}.js`, `lib/runs.js`, `lib/db.js`, `lib/runner.js`,
  `lib/runs-api.js`, `run.js`, `tests/runs.test.js`; `README.md`, `AGENTS.md`

## Ordem de tasks

1. `139` — conversa contínua (CLI + API + docs). depende de: —

## Riscos

- Sintaxe de retomada muda entre versões das tools → validar com as tools reais; `codex exec resume`
  com prompt pelo stdin é o ponto mais incerto.
