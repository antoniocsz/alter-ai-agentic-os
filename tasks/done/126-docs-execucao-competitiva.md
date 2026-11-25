# Task: docs execucao competitiva
## Agente: `docs`
## Módulo: `harness`
## Feature: execucao-competitiva
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-5
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/execucao-competitiva/spec.md`
## Depende de: [ ] `125`
## Contexto para ler: context/features/execucao-competitiva/spec.md · handoffs 124 e 125
## Skills a carregar: codegen.md
## O que já existe: execução competitiva entregue (124, 125); docs não citam `harness compete`.
## O que criar:
- `README.md` → seção "Execução competitiva" + linha na tabela da CLI
- `AGENTS.md` → papel de juiz
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 126`
## Complexidade: baixa

## Baseline (git)
- context/features/execucao-competitiva/spec.md
- tasks/queue/126-docs-execucao-competitiva.md
