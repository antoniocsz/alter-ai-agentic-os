# Task: SQLite busy_timeout e close
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/lib/memory.js`
## Depende de: [x] 63-tasks-worktree-hardening.md
## O que criar:
- `PRAGMA busy_timeout=5000`; fechar DBs em finally nos pontos de leitura.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes
