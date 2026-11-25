# Task: docs app desktop
## Agente: `docs`
## Módulo: `harness`
## Feature: app-desktop
## Prioridade: P2
## Tipo: docs
## ACs: AC-5
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `context/features/app-desktop/spec.md`
## Depende de: [ ] `135`
## Contexto para ler: context/features/app-desktop/spec.md · apps/desktop/README.md
## Skills a carregar: codegen.md
## O que já existe: app desktop entregue (135).
## O que criar:
- `README.md` → seção "App desktop" + rota `/api/shutdown`
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README atualizado
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 136`
## Complexidade: baixa

## Baseline (git)
- context/features/app-desktop/spec.md
- tasks/queue/136-docs-app-desktop.md
