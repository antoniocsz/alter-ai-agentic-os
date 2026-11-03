# Task: Gates strict (skipped vs blocked)
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Escopo:
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/report.js`
- `scripts/harness/tests/gates.test.js`
- `scripts/harness/tests/check.test.js`
## Depende de: [x] 59-kanban-nextjs.md
## O que criar:
- `gates.strict` (default false): em strict, gate pulado por falta de script/deps reprova o finish.
## Critério de conclusão:
- [ ] strict reprova skip; default mantém comportamento
- [ ] testes verdes

## Baseline (git)
- tasks/queue/60-gates-strict.md
- tasks/queue/61-check-db-days.md
- tasks/queue/62-workspace-json-adapter.md
- tasks/queue/63-tasks-worktree-hardening.md
- tasks/queue/64-sqlite-robustez.md
- tasks/queue/65-parser-flags.md
- tasks/queue/66-copydir-binario.md
- tasks/queue/67-datas-locais.md
- tasks/queue/68-adapter-layer.md
- tasks/queue/69-kanban-v2-actions.md
- tasks/queue/70-release-v033.md
