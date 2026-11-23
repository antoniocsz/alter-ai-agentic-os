# Task: docs pacote de contexto
## Agente: `backend`
## Módulo: `harness`
## Feature: pacote-de-contexto
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `scripts/harness/src/commands/index.js`
- `context/features/pacote-de-contexto/spec.md`
## Depende de: [ ] `104`
## Contexto para ler: context/features/pacote-de-contexto/spec.md · handoffs 103/104
## Skills a carregar: —
## O que já existe: `harness context` e o pacote no `run` (tasks 103–104) sem documentação.
## O que criar:
- README: tabela do CLI + seção "Pacote de contexto (`harness context`)" + menção no `run`
- AGENTS.md: uso do pacote
- ajuda do CLI: flags `--no-context`/`--context-budget`
- spec: ACs marcados + estado
## Especificação: documentar só o que existe e foi testado.
## Critério de conclusão:
- [ ] `harness help` mostra as flags
- [ ] Links do índice do README resolvem
- [ ] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 105`
## Complexidade: baixa
