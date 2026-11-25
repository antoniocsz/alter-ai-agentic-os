# Task: docs coordenador de tarefas
## Agente: `docs`
## Módulo: `harness`
## Feature: coordenador-de-tarefas
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-4
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/coordenador-de-tarefas/spec.md`
## Depende de: [ ] `137`
## Contexto para ler: context/features/coordenador-de-tarefas/spec.md · handoff 137
## Skills a carregar: codegen.md
## O que já existe: coordenador entregue (137).
## O que criar:
- `README.md` → seção "Coordenador de tarefas" + linha na tabela da CLI
- `AGENTS.md` → papel de coordenador
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 138`
## Complexidade: baixa

## Baseline (git)
- context/features/coordenador-de-tarefas/spec.md
- tasks/queue/138-docs-coordenador-de-tarefas.md
