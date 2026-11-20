# Task: Barramento de eventos normalizado
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/events.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/events.js`
- `scripts/harness/bin/harness.js`
- `scripts/harness/tests/events.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/harness/context.md, ARCHITECTURE.md (seção 4.1), ADR-006
## Skills a carregar: codegen.md + backend.md + observability.md
## O que já existe: tabela `task_events` (task_id, event, message, at) gravada por start/finish/requeue/reopen/check; tabela `interactions`.
## O que criar:
- `src/lib/events.js` → `emit(db, event)`, `listEvents(db, filtros)`, validação do formato normalizado
- `src/events.js` → comando `harness events [--task <t>] [--type <prefixo>] [--since <iso>] [--json]`
- migração em `db.js`: tabela `events` + bump de `schema_version`
## Especificação:
- Tabela `events(id, ts, type, task_id, agent_id, runtime, session_id, payload_json, native_json, measured)` com índices em `task_id` e `type`.
- `emit` rejeita `type` fora do padrão `<dominio>.<acao>` (ex.: `task.started`, `agent.tool_call`).
- `pipeline.js` passa a emitir `task.started|finished|requeued|reopened|out_of_scope` em `events` **além** de `task_events` (compatibilidade: `history`, `report` e kanban continuam funcionando sem mudança).
- `harness sync` não apaga `events` (é log de execução, não índice regenerável).
- Zero dependências novas.
## Critério de conclusão:
- [ ] `events` criada em banco novo e migrada em banco existente (teste com banco v-anterior)
- [ ] start/finish/requeue/reopen geram eventos `task.*` (teste)
- [ ] `harness events --json` lista e filtra por task/tipo (teste)
- [ ] `pnpm test` 100% e `pnpm harness check` limpo
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 20-barramento-de-eventos-normalizado.md`
## Complexidade: média
