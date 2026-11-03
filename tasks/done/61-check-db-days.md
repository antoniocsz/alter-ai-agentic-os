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

## Critério de conclusão:
- [ ] critérios da descrição atendidos; testes verdes

## Baseline (git)
- tasks/queue/61-check-db-days.md
- tasks/queue/62-workspace-json-adapter.md
- tasks/queue/63-tasks-worktree-hardening.md
- tasks/queue/64-sqlite-robustez.md
- tasks/queue/65-parser-flags.md
- tasks/queue/66-copydir-binario.md
- tasks/queue/67-datas-locais.md
- tasks/queue/68-adapter-layer.md
- tasks/queue/69-kanban-v2-actions.md
- tasks/queue/70-release-v033.md
- tasks/queue/71-docs-readme.md
- tasks/queue/72-docs-agents-templates.md
- tasks/queue/73-docs-agents-openCode.md
- tasks/queue/74-docs-workspace.md
- tasks/queue/75-docs-changelog-status.md
- tasks/queue/76-code-quality.md
