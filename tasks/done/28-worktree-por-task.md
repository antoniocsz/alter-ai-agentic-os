# Task: Worktree por task (start/finish/list/prune) + gates de merge (Fase 3)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/worktree.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/worktree.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 27-init-dry-run.md
## Contexto para ler: plano v0.3 (D4 worktree por task, D11 trunk-based, F3)
## Skills a carregar: codegen.md
## O que já existe:
- Pipeline queue→active→done com validação de escopo no finish.
- `harness.json` com `git.model`/`featureBranch` (declarativo) e gates.
## O que criar:
- `harness worktree start <n>`: exige task ativa; cria `.worktrees/task-<n>-<slug>` e branch `task/<n>-<slug>` a partir da base (main/master configurável).
- `harness worktree finish <n>`: commit do que estiver sujo, rebase na base, roda gates.merge, squash merge na base, `finish` da task, remove worktree/branch.
- `--keep` (mantém worktree) e `--skip-gates`.
- `worktree list` / `worktree prune`.
- Registro em `.harness/worktrees.json` + eventos no SQLite.
- Gates: executor mínimo de scripts do `package.json` (pula ausente/sem node_modules); motor completo na F4.
## Especificação:
- Base branch: `harness.json git.baseBranch` → main/master → branch atual.
- Nunca trocar de branch do repo principal silenciosamente: se não estiver na base, abortar com instrução.
- Falha de gate aborta antes do merge (worktree preservada para inspeção).
- `finish` da task valida escopo como hoje e move para done.
## Critério de conclusão:
- [ ] worktree start/finish/list/prune funcionam em repo temporário
- [ ] merge squash + task done + worktree removida
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 28-worktree-por-task.md --handoff "<resumo>"`
## Complexidade: alta

## Baseline (git)
- AGENTS.md
- README.md
- scripts/harness/src/commands/index.js
- scripts/harness/src/lib/gates.js
- scripts/harness/src/lib/worktree.js
- scripts/harness/src/worktree.js
- scripts/harness/tests/worktree.test.js
- tasks/queue/28-worktree-por-task.md
