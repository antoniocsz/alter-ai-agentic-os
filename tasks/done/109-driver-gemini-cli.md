# Task: driver gemini cli
## Agente: `backend`
## Módulo: `harness`
## Feature: runtime-gemini
## Prioridade: P2
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/gemini.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/run-gemini.test.js`
- `scripts/harness/tests/fixtures/runtimes/gemini`
## Depende de: [ ] `-`
## Contexto para ler: context/features/runtime-gemini/spec.md · plan.md · scripts/harness/src/lib/runtimes/codex.js e opencode.js (contrato) · scripts/harness/src/run.js (DRIVERS)
## Skills a carregar: codegen.md + security.md
## O que já existe: runner + drivers claude/codex/opencode com `create()`; `DRIVERS` em run.js; orçamento e pacote de contexto independentes do driver. NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `lib/runtimes/gemini.js` (NOVO) → driver (command, create com buffer de deltas, normalize dos 6 eventos)
- `run.js` → `DRIVERS.gemini`
- `tests/fixtures/runtimes/gemini/` (NOVO) → transcrições sintéticas (sucesso, erro)
- `tests/run-gemini.test.js` (NOVO)
## Especificação: ver spec AC-1..AC-5. Campos conferidos no código do Gemini CLI (nonInteractiveCli.ts / tipos do stream-json): init {session_id, model}; message {role, content, delta}; tool_use {tool_name, tool_id, parameters}; tool_result {tool_id, status, output, error{type,message}}; error {severity, message}; result {status, stats{total_tokens, input_tokens, output_tokens, cached}}.
## Critério de conclusão:
- [ ] Teste: transcrição → eventos esperados (deltas acumulados, write_file/replace → file_changed)
- [ ] Teste: result.status error → failed; uso medido, custo nulo
- [ ] Teste: command padrão auto_edit, unsafe yolo; CLI --tool gemini na worktree
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 109`
## Complexidade: média
