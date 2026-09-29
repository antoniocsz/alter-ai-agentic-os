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

## Fase 3 — Limpeza de dogfood
- [x] Removidas tasks de exemplo do template (queue 03–06, active 02, done 01)
- [x] Removidos módulos padrão do template (tenancy, auth, authorization, audit, analytics)
- [x] `context/project/overview.md` e `stack.md` reescritos com a identidade do repo-fonte
- [x] `harness sync` (órfãos 01–06 removidos do banco)

## Fase 4 — Evolução (lote B1+B2+B3+C1+A1)
- [x] B1 — `harness workspace task <projeto> "<desc>"` cria task direto no projeto
- [x] B2 — `harness workspace report --all --format json` agrega métricas num JSON único
- [x] B3 — `harness check` na raiz do workspace valida isolamento automaticamente
- [x] C1 — ADR-004 (copy-per-project) e ADR-005 (workspaces)
- [x] A1 — WIP limits no kanban (`.harness/kanban.json`, move bloqueado com 400, badges no header)
- [x] `computeMetrics` sincroniza do markdown (fonte da verdade)

## Fase 5 — Ergonomia (init --workspace, grupo por módulo, version/changelog)
- [x] `harness init --workspace <dir>` delega para `workspace init`
- [x] Kanban: toggle "agrupar por módulo" nas colunas
- [x] `harness version [--bump patch|minor|major]` (incrementa + registra interação)
- [x] `harness changelog [--out CHANGELOG.md]` (gera a partir dos handoffs)
- [x] Testes 69/69

## Handoff (lote 2 — tasks 10, 11 e 12)
- Feito: limpeza de dogfood (tasks/módulos de exemplo do template removidos; identidade do
  repo-fonte em overview/stack) e evolução (B1 `workspace task`, B2 `report --all --format json`,
  B3 `check` na raiz do workspace, C1 ADRs 004/005, A1 WIP limits no kanban) + correções da
  revisão (openDb morto removido, computeMetrics fecha o banco, handoff renovado).
- Pendências: nenhuma. Testes 67/67, `harness check` ok.
- Decisões: computeMetrics sincroniza do markdown (fonte da verdade); WIP via
  `.harness/kanban.json` avaliado por projeto dono do card; `check` na raiz do workspace
  valida isolamento sem afetar o check de projeto.