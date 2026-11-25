# Task: docs qualidade e analytics
## Agente: `docs`
## Módulo: `harness`
## Feature: qualidade-e-analytics
## Prioridade: P2
## Tipo: docs
## ACs: AC-2, AC-5
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `context/features/qualidade-e-analytics/spec.md`
## Depende de: [ ] `129`
## Contexto para ler: context/features/qualidade-e-analytics/spec.md · handoffs 128 e 129
## Skills a carregar: codegen.md
## O que já existe: gates pós-run e analytics entregues (128, 129).
## O que criar:
- `README.md` → seção "Qualidade pós-run e analytics" + linha na tabela da CLI
- `AGENTS.md` → gates pós-run
- `spec.md` → ACs e Estado
## Especificação: documentação fiel ao entregue.
## Critério de conclusão:
- [x] README e AGENTS.md atualizados
- [x] Spec com ACs e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 130`
## Complexidade: baixa

## Baseline (git)
- context/features/qualidade-e-analytics/spec.md
- tasks/queue/130-docs-qualidade-e-analytics.md
