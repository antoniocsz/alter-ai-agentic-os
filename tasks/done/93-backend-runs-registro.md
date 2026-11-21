# Task: Execução de agentes — registro de runs e eventos de execução
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: execucao-agentes
## ACs: AC-1, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/runs.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/runs.test.js`

Anotações do escopo: `lib/runs.js`, `src/runs.js` e o teste são novos; `db.js` recebe só a migração e as queries de runs; `commands/index.js` só registra `runs` e `events`.
## Depende de: —
## Contexto para ler: context/features/execucao-agentes/spec.md · context/features/execucao-agentes/plan.md · scripts/harness/src/lib/db.js · scripts/harness/src/commands/index.js
## Skills a carregar: codegen.md
## O que já existe:
- `lib/db.js`: `tasks`, `sessions`, `task_events`, `interactions`; `syncFromMarkdown` reindexa tasks (não deve tocar runs)
- `lib/redact.js`: redaction de segredos (aplicar em payloads de evento antes de gravar)
- NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js ...`; zero deps
## O que criar:
- Migração idempotente: `runs(id TEXT PK, task_id, tool, tool_version, model, session_id, status CHECK IN ('running','completed','failed'), pid, cwd, exit_code, started_at, finished_at, tokens_in, tokens_out, cost_usd, measured INTEGER, error)` e `run_events(id INTEGER PK, run_id, seq, at, type, payload_json, native_json)` com índices em `run_events(run_id, seq)` e `runs(task_id)`
- `lib/runs.js` → `startRun(db, {taskId, tool, ...})` (id `run-<task>-<timestamp>`), `appendRunEvent(db, runId, {type, payload, native})` (seq monotônico, payload/native redigidos), `finishRun(db, runId, {status, exitCode, usage, error})`, `listRuns(db, {taskId})`, `runEvents(db, runId)`, `reapOrphans(db)` (run `running` com pid inexistente → `failed`, error `orphaned`)
- `src/runs.js` → `harness runs [<task>] [--json]` (tabela: run, task, tool, status, duração, tokens, custo, medido/estimado) e `harness events <run> [--json]`
## Especificação:
- Tipos de evento válidos: `run.started|completed|failed`, `agent.message|tool_call|tool_result|file_changed|usage|error`; tipo fora da lista é rejeitado pelo `appendRunEvent`
- `usage` ausente → colunas `null` e `measured = 0`; nunca estimar tokens nesta task
- `harness sync` e `check --db` não apagam nem acusam drift em runs
## Critério de conclusão:
- [ ] Migração em banco novo e em banco existente (fixture sem as tabelas) — teste
- [ ] start/append/finish com seq monotônico e redaction aplicada — teste
- [ ] `reapOrphans` marca run com pid morto como `failed`/`orphaned` — teste
- [ ] `harness runs --json` e `harness events <run> --json` — teste via CLI real
- [ ] Suíte completa verde (≥241); `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 93`
## Complexidade: média
