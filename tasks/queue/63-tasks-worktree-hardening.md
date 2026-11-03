# Task: task id seguro + prune de bem
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/lib/tasks.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/tests/tasks.test.js`
- `scripts/harness/tests/worktree.test.js`
## Depende de: [ ] 62-workspace-json-adapter.md
## O que criar:
- Rejeitar `../`, `/` e `\` em nomes de task (CLI e kanban).
- Prune remove a branch órfã; registry com escrita atômica.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes
