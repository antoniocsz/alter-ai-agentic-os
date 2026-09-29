# harness — Status

## Fase 1 — Fundação do harness
- [x] CLI `scripts/harness` (init, module, task, start, finish, requeue, reopen, sync, log, history, report, kanban, check, update)
- [x] Banco SQLite `.harness/harness.db` (tasks, task_events, interactions; regenerável via `harness sync`)
- [x] Agents prontos (`.opencode/agent/`) + referências modulares (`.agents/*.md`)
- [x] Pipeline queue → active → done com escopos disjuntos (paralelismo seguro)

## Fase 2 — Workspaces (múltiplos projetos)
- [x] `harness workspace init` (registro `.harness-workspace.json` + cache do AGENTS.md)
- [x] `harness workspace new` (projeto novo no workspace) e `add` (projeto existente com onboarding)
- [x] `harness workspace list|status` (queue/active/done, versão, onboarded)
- [x] `harness workspace check|sync|report|update [--all]` com validação de isolamento
- [x] `harness workspace run <projeto> <cmd>` + flag global `--project <projeto>`
- [x] Kanban agregado multi-projeto com detalhamento (modal: escopo, arquivo, timeline, interações)
- [x] Testes de workspace + kanban (`tests/workspace.test.js`, `tests/kanban.test.js`)
- [ ] Typecheck: [ ]

## Handoff
- [x] Preenchido ao finalizar cada task: feito / pendências / decisões