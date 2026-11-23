# Task: docs orquestracao paralela
## Agente: `backend`
## Módulo: `harness`
## Feature: orquestracao-paralela
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `scripts/harness/src/commands/index.js`
- `context/features/orquestracao-paralela/spec.md`
## Depende de: [ ] `101`
## Contexto para ler: context/features/orquestracao-paralela/spec.md · handoffs 100/101
## Skills a carregar: —
## O que já existe: `run --batch`, `runs --batch` e o lote no /canvas (tasks 100–101) sem documentação.
## O que criar:
- README: tabela do CLI + subseção "Lote paralelo (`run --batch`)" em "Execução de agentes"
- AGENTS.md: exemplo de lote na subseção de execução por agente
- ajuda do CLI: `--batch`/`--max-parallel`/`runs --batch`
- spec: ACs marcados + estado
## Especificação: documentar só o que existe e foi testado.
## Critério de conclusão:
- [ ] `harness help` mostra as flags
- [ ] Links do índice do README resolvem
- [ ] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 102`
## Complexidade: baixa
