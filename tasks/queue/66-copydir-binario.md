# Task: copyDir binário-safe
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/lib/templates.js`
- `scripts/harness/tests/templates.test.js`
## Depende de: [ ] 65-parser-flags.md
## O que criar:
- Renderizar só texto; copiar binários byte a byte e preservar modo executável.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes
