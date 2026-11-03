# Task: P0 — Integridade de escopo (HEAD baseline + pré-merge) (Sprint 0)
## Agente: `coordinator` (segurança)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/git.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/tests/pipeline.test.js`
- `scripts/harness/tests/worktree.test.js`
- `scripts/harness/tests/git.test.js`
## Depende de: [x] 52-release-v032.md
## Contexto para ler: review v0.3.2 P0 #1/#2 (escopo contornável por commit; merge antes de validar)
## O que criar:
- Baseline por HEAD SHA registrado no `start` e validação de `git diff HEAD..HEAD` (commits) + working tree no `finish`.
- Validação de escopo na worktree ANTES do rebase/merge.
## Critério de conclusão:
- [ ] commit de arquivo fora do escopo reprova o finish
- [ ] worktree com arquivo fora do escopo não mergeia
- [ ] testes de regressão verdes
## Complexidade: alta

## Baseline (git)
- scripts/harness/src/lib/git.js
- tasks/queue/53-p0-escopo-integridade.md
- tasks/queue/54-p0-git-injecao.md
- tasks/queue/55-p0-segredos.md
- tasks/queue/56-p0-kanban-seguro.md
- tasks/queue/57-p0-lock-heartbeat.md
- tasks/queue/58-p0-workspace-config.md
- tasks/queue/59-kanban-nextjs.md
