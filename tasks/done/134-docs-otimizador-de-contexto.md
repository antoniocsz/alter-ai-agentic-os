# Task: docs otimizador de contexto
## Agente: `docs`
## Módulo: `harness`
## Feature: otimizador-de-contexto
## Prioridade: P2
## Tipo: docs
## ACs: AC-3, AC-4
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/otimizador-de-contexto/spec.md`
## Depende de: [ ] `133`
## Contexto para ler: context/features/otimizador-de-contexto/spec.md · handoffs 132 e 133
## Skills a carregar: codegen.md
## O que já existe: otimizador e digest entregues (132, 133).
## O que criar:
- `README.md` → subseção "Otimizador de contexto" + linha na tabela da CLI
- `AGENTS.md` → pacote otimizado e digest
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 134`
## Complexidade: baixa

## Baseline (git)
- context/features/otimizador-de-contexto/spec.md
- tasks/queue/134-docs-otimizador-de-contexto.md
