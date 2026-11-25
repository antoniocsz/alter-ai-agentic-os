# Task: docs memoria em niveis
## Agente: `docs`
## Módulo: `harness`
## Feature: memoria-em-niveis
## Prioridade: P2
## Tipo: docs
## ACs: AC-3, AC-6
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/memoria-em-niveis/spec.md`
## Depende de: [ ] `119`
## Contexto para ler: context/features/memoria-em-niveis/spec.md · handoffs 118 e 119
## Skills a carregar: codegen.md
## O que já existe: memória em níveis entregue (118, 119); README/AGENTS só descrevem sessões e recall.
## O que criar:
- `README.md` → seção "Memória em níveis" + linha na tabela da CLI
- `AGENTS.md` → uso da memória pelo agente e bloco MEMÓRIA:
- `spec.md` → ACs marcados e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 120`
## Complexidade: baixa

## Baseline (git)
- context/features/memoria-em-niveis/spec.md
- tasks/queue/120-docs-memoria-em-niveis.md
