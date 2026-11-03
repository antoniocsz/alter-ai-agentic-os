# Task: Conventional Commits por task (Fase 8 🟡)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/commits.js`
- `scripts/harness/src/task.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/templates/task/task.md.tpl`
- `scripts/harness/tests/commits.test.js`
- `scripts/harness/tests/worktree.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 41-alias-harness.md
## Contexto para ler: F8 🟡 (Conventional Commits)
## Skills a carregar: codegen.md
## O que criar:
- `lib/commits.js`: tipos válidos + builder `type(task-N): subject`.
- `task --type feat|fix|docs|refactor|test|chore|perf|build|ci` (default feat) + `## Tipo`.
- `worktree finish` usa o tipo da task na mensagem do squash merge.
## Especificação:
- Tipo inválido falha com lista; tasks antigas sem `## Tipo` usam `feat`.
- Mensagem determinística a partir do nome da task.
## Critério de conclusão:
- [ ] commit do merge segue Conventional Commits
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 42-conventional-commits.md --handoff "<resumo>"`
## Complexidade: baixa/média

## Baseline (git)
- AGENTS.md
- README.md
- scripts/harness/src/lib/worktree.js
- scripts/harness/src/task.js
- scripts/harness/templates/task/task.md.tpl
- scripts/harness/tests/worktree.test.js
- scripts/harness/src/lib/commits.js
- scripts/harness/tests/commits.test.js
- tasks/queue/42-conventional-commits.md
