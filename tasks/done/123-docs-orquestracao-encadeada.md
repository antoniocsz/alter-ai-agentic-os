# Task: docs orquestracao encadeada
## Agente: `docs`
## Módulo: `harness`
## Feature: orquestracao-encadeada
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-5
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/orquestracao-encadeada/spec.md`
## Depende de: [ ] `122`
## Contexto para ler: context/features/orquestracao-encadeada/spec.md · handoffs 121 e 122
## Skills a carregar: codegen.md
## O que já existe: fluxo encadeado entregue (121, 122); docs ainda não citam `harness flow`.
## O que criar:
- `README.md` → seção "Orquestração encadeada" + linha na tabela da CLI
- `AGENTS.md` → papel de revisor e de correção
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 123`
## Complexidade: baixa

## Baseline (git)
- context/features/orquestracao-encadeada/spec.md
- tasks/queue/123-docs-orquestracao-encadeada.md
