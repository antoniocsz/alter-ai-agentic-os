# Task: check --db real e validação de --days
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P1 | Tipo: fix
## Escopo:
- `scripts/harness/src/check.js`
- `scripts/harness/src/report.js`
- `scripts/harness/tests/check.test.js`
## Depende de: [ ] 60-gates-strict.md
## O que criar:
- `check` não cria o DB só para validar; `--db` compara contagem markdown × banco.
- `report --days` inválido falha com mensagem clara (sem RangeError).
