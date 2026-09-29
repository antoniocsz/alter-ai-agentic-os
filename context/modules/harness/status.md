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
- [x] Correções da revisão (P1–P4): docs de paths relativos, erro de `--project` tratado, status.md real, `handleDetail` com prefixo ambíguo → 400

## Handoff (lote 1 — task 08 + limpeza 09)
- Feito: camada de workspaces (init/new/add/list/status/check/sync/report/update/run/kanban),
  flag global `--project`, isolamento validado no check, kanban agregado com modal de detalhes.
- Pendências: nenhuma. Testes 59/59, `harness check` ok.
- Decisões: copy-per-project mantido; cache do AGENTS.md em `.harness/workspace/`;
  registro com paths relativos (absoluto em memória); kanban lê markdown como fonte da verdade.