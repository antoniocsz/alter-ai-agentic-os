# Task: copyDir binário-safe
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/lib/templates.js`
- `scripts/harness/src/lib/dates.js`
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/src/retro.js`
- `scripts/harness/src/feature.js`
- `scripts/harness/tests/templates.test.js`
- `scripts/harness/tests/memory.test.js`
## Depende de: [x] 63-tasks-worktree-hardening.md
## O que criar:
- Renderizar só texto; copiar binários byte a byte e preservar modo executável.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes

## Baseline (git)
- scripts/harness/src/lib/templates.js
- tasks/queue/64-sqlite-robustez.md
- tasks/queue/66-copydir-binario.md
- tasks/queue/67-datas-locais.md
