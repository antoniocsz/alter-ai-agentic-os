# Plano: execucao-agentes

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-20.

## Abordagem

- **Armazenamento:** novas tabelas em `lib/db.js` — `runs(id, task_id, tool, model, session_id, status, pid, cwd, exit_code, started_at, finished_at, tokens_in, tokens_out, cost_usd, measured, error)` e `run_events(id, run_id, seq, at, type, payload_json, native_json)`. `task_events` continua como está (pipeline); o canvas lê os dois.
- **Núcleo de execução** em `lib/runner.js` (novo): spawn sem shell no POSIX; no Windows resolve `<tool>.cmd`/`.exe` no PATH e usa `shell: true` com args validados (mesmo padrão de `lib/gates.js`). Leitura de stdout por linha, parse JSON tolerante, normalização delegada a um **driver por tool**.
- **Drivers** em `lib/runtimes/<tool>.js` (novos): `command(task, opts) → { bin, args }` e `normalize(line) → evento[]`. Fontes das flags (conferidas em 2026-11-20, revalidar na implementação):
  - Claude Code: `claude -p "<prompt>" --output-format stream-json --verbose` (+ `--permission-mode` conforme sandbox; `--model`). Evento final `result` traz `usage`, `total_cost_usd`, `session_id`. Doc: code.claude.com/docs/en/headless
  - Codex: `codex exec --json "<prompt>"` — eventos `thread.started`, `turn.*`, `item.*` (agent_message, command_execution, file_change, mcp_tool_call), `error`. Doc: developers.openai.com/codex/noninteractive
  - OpenCode: `opencode run --format json "<prompt>"` — NDJSON com `type`, `timestamp`, `sessionID`. Doc: opencode.ai/docs/cli
- **Prompt:** corpo da task + bloco fixo do protocolo (escopo estrito, não rodar finish/merge, registrar nota final). Passado por argumento (ou stdin quando o runtime aceitar) — nunca interpolado em shell.
- **Testes:** executável falso (`tests/fixtures/runtimes/fake-<tool>.js` + shim no PATH) que reproduz transcrições JSONL gravadas; cobre normalização, linha inválida, interrupção e exit code ≠ 0.

## Módulos e arquivos afetados

- `scripts/harness/src/lib/db.js` — migração `runs`/`run_events` + queries
- `scripts/harness/src/lib/runs.js` — novo (API de registro + órfãos)
- `scripts/harness/src/lib/runner.js` — novo (spawn, stream, interrupção)
- `scripts/harness/src/lib/runtimes/{claude,codex,opencode}.js` — novos (drivers)
- `scripts/harness/src/run.js`, `scripts/harness/src/runs.js` — novos comandos
- `scripts/harness/src/commands/index.js` — registro dos comandos
- `scripts/harness/src/lib/canvas.js`, `scripts/harness/src/kanban.js` — run corrente no cartão
- `scripts/harness/tests/{runs,run-claude,run-codex-opencode,canvas-runs}.test.js` + `tests/fixtures/runtimes/`

## Ordem de tasks

1. `93-backend-runs-registro.md` — tabelas + API + `harness runs`/`events`. depende de: —
2. `94-backend-run-claude.md` — runner + driver Claude + `harness run`. depende de: 93
3. `95-backend-canvas-runs.md` — run corrente no `/canvas` (tool, último evento, tokens/custo). depende de: 94
4. `96-backend-run-codex-opencode.md` — drivers Codex e OpenCode. depende de: 94

**Sequenciamento:** 95 e 96 têm escopos disjuntos e podem rodar em paralelo depois da 94.

## Riscos

- Formato JSONL dos runtimes muda entre versões → driver tolerante (campo desconhecido vai para `native`, nunca quebra); versão do runtime gravada no run.
- Windows: `.cmd` exige shell → args validados e prompt passado sem interpolação; matar árvore de processos (`taskkill /T /F`).
- OpenCode no modo `run` aprova permissões automaticamente → documentar no `run` e exigir `--unsafe` explícito para essa tool até haver controle equivalente.
- Execução real não é testável no CI → critério manual por task (rodar uma task de exemplo e anexar o resumo do `harness events` no handoff).
