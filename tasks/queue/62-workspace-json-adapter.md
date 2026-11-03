# Task: workspace --all --json + adapter source + gitignore
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/lib/adapters.js`
- `scripts/harness/templates/project/_base/.gitignore`
- `scripts/harness/tests/workspace.test.js`
- `scripts/harness/tests/adapters.test.js`
## Depende de: [ ] 61-check-db-days.md
## O que criar:
- `workspace check --all --json` emite JSON válido (filhos silenciosos).
- `harness adapter` falha claro quando a fonte não existe; init copia adapters.
- `kanban.html` no gitignore do template.

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes
