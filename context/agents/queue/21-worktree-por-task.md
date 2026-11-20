# Task: Worktree por task (start --worktree, merge, worktree list/clean)
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/src/lib/git.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/start.js`
- `scripts/harness/src/finish.js`
- `scripts/harness/src/merge.js`
- `scripts/harness/src/worktree.js`
- `scripts/harness/bin/harness.js`
- `scripts/harness/tests/worktree.test.js`
## Depende de: [ ] `20-barramento-de-eventos-normalizado.md`
## Contexto para ler: ARCHITECTURE.md (seção 4.3), ADR-006, context/modules/harness/status.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: paralelismo por escopo disjunto na mesma working tree; `git.js` com `modifiedFiles`/`outOfScopeFiles` baseados em `git status`.
## O que criar:
- `lib/worktree.js` → `createWorktree(root, task)`, `removeWorktree`, `listWorktrees`, `branchDiffFiles(root, branch)`
- `start --worktree`: cria branch `task/<nn>-<slug>` + worktree em `.harness/worktrees/<nn>-<slug>`; grava `## Worktree` (path + branch + commit base) na task
- `finish`: se a task tem `## Worktree`, valida `git diff --name-only <base>...<branch>` (+ arquivos não commitados da worktree) contra o `## Escopo`
- `harness merge <task>`: exige task em done/, `check` limpo e working tree principal limpa; faz merge `--no-ff` da branch; em conflito, aborta e reporta (nunca resolve sozinho)
- `harness worktree list|clean [--all]`: lista e remove worktrees de tasks em done/ já mergeadas
## Especificação:
- Eventos: `worktree.created|merged|removed`.
- Tasks com worktree **não** entram na checagem de conflito de escopo da árvore principal (isolamento real), mas `merge` detecta conflito.
- Sem `--worktree`, comportamento atual inalterado.
- Nunca usar `git checkout/reset/restore` na árvore principal.
## Critério de conclusão:
- [ ] Teste: start --worktree cria branch + worktree; arquivo fora do escopo na worktree bloqueia finish
- [ ] Teste: merge de branch válida; merge com conflito aborta sem alterar a árvore principal
- [ ] Teste: worktree clean remove só worktrees mergeadas
- [ ] `pnpm test` 100% e `pnpm harness check` limpo
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 21-worktree-por-task.md`
## Complexidade: alta
