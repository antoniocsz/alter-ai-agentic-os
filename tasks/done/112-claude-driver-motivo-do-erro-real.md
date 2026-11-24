# Task: claude driver motivo do erro real
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/claude.js`
- `scripts/harness/tests/run-claude.test.js`
- `scripts/harness/tests/fixtures/runtimes/claude-real-auth-error.jsonl`
## Depende de: [ ] `-`
## Contexto para ler: scripts/harness/src/lib/runtimes/claude.js · D:\projetos\.tmp\validacao-runtimes\ (validação real, Claude Code 2.1.101)
## Skills a carregar: codegen.md
## O que já existe: validação real com Claude Code 2.1.101 (Windows): formato do stream-json confirmado (system/init, assistant com message.id/usage, result). Sem login, o Claude manda `result` com `subtype: "success"` + `is_error: true` e a mensagem em `result`, e o assistant com `error: "authentication_failed"`; o driver usava o subtype como motivo → saída "❌ success".
## O que criar:
- `lib/runtimes/claude.js` → motivo do erro = texto de `result` (senão `error` do assistant, senão subtype); `assistant.error` no payload
- `tests/fixtures/runtimes/claude-real-auth-error.jsonl` (NOVO) → saída REAL gravada (sem segredos: só ids de sessão e a mensagem de login)
- `tests/run-claude.test.js` → teste com a transcrição real
## Especificação: run com a transcrição real termina `failed` com erro contendo "Not logged in".
## Critério de conclusão:
- [x] Teste com a transcrição real: erro "claude: Not logged in · Please run /login"; evento agent.error com o mesmo motivo
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 112`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/112-claude-driver-motivo-do-erro-real.md
