# Task: docs orcamento de custos
## Agente: `backend`
## Módulo: `harness`
## Feature: orcamento-de-custos
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `scripts/harness/src/commands/index.js`
- `context/features/orcamento-de-custos/spec.md`
## Depende de: [ ] `107`
## Contexto para ler: context/features/orcamento-de-custos/spec.md · handoffs 106/107
## Skills a carregar: —
## O que já existe: `harness budget`, limites no run/lote (106–107) sem documentação.
## O que criar:
- README: tabela do CLI + seção "Orçamento (`harness budget`)" + `budget` no exemplo de harness.json + menção no run
- AGENTS.md: regra de orçamento
- ajuda do CLI: `--ignore-budget`
- spec: ACs + estado
## Especificação: documentar só o que existe e foi testado.
## Critério de conclusão:
- [ ] `harness help` mostra os comandos/flags
- [ ] Links do índice do README resolvem
- [ ] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 108`
## Complexidade: baixa
