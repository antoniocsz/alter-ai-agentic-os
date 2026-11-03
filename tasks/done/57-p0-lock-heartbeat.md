# Task: P0 — Lock com ownership/heartbeat e timeout de gate (Sprint 0)
## Agente: `coordinator` (segurança)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/lock.js`
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/tests/lock.test.js`
## Depende de: [ ] 56-p0-kanban-seguro.md
## O que criar:
- Lock com token de ownership, heartbeat durante operação longa, release só do dono, timeout de gate configurável.
## Critério de conclusão:
- [ ] release do processo antigo não apaga o lock do novo
- [ ] gate lento não é interrompido pelo stale
## Complexidade: média

## Baseline (git)
- scripts/harness/src/lib/gates.js
- scripts/harness/src/lib/lock.js
