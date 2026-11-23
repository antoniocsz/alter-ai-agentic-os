# Task: worktree finish rebase sem identidade git
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/tests/worktree.test.js`
## Depende de: [ ] `-`
## Contexto para ler: scripts/harness/src/lib/worktree.js (finishWorktreeUnlocked) · run 44985807555 do GitHub Actions
## Skills a carregar: codegen.md
## O que já existe: `worktree finish` passa `-c user.name=harness -c user.email=harness@local` no commit do trabalho sujo e no squash, mas NÃO no `git rebase <base>`. Rebase que reaplica commits precisa de committer → sem identidade global (runner do CI, máquina nova) falha com `empty ident name`. Run 44985807555: 270/271, falha em pipeline-cross 'merge intercalado'. Localmente passava porque o ambiente tinha GIT_AUTHOR_*/GIT_COMMITTER_*.
## O que criar:
- `lib/worktree.js` → identidade do harness num único helper (`HARNESS_IDENTITY`), usada no commit, no rebase e no squash
- `tests/worktree.test.js` → teste que roda `worktree finish` com rebase sob `user.useConfigOnly=true` e sem identidade no ambiente
## Especificação: comportamento de autoria inalterado (commits do harness continuam `harness <harness@local>`); só o rebase ganha a mesma identidade.
## Critério de conclusão:
- [ ] Teste novo falha sem a correção e passa com ela
- [ ] Suíte completa verde; `harness check` ok
- [ ] CI verde após o push
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 98`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/98-worktree-finish-rebase-sem-identidade-git.md
