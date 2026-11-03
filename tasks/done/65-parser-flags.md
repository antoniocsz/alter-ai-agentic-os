# Task: Parser único de flags
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: refactor
## Módulo: `harness`
## Escopo:
- `scripts/harness/src/lib/flags.js`
- `scripts/harness/src/finish.js`
- `scripts/harness/src/worktree.js`
- `scripts/harness/src/task.js`
- `scripts/harness/src/log.js`
- `scripts/harness/tests/flags.test.js`
## Depende de: [ ] 64-sqlite-robustez.md
## O que criar:
- `--k v` / `--k=v` com validação de valor; fim do posicional frágil.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes
