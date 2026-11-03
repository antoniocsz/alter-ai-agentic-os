# Task: Reaplicar referência ao runbook no README base (doc)
## Agente: `coordinator` (doc)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/project/_base/README.md`
## Depende de: [x] 43-runbook-assets.md
## Contexto para ler: isolamento temporário da task 43 removeu a linha e ela não voltou
## Skills a carregar: —
## O que criar:
- Linha `context/project/runbook.md` na lista de contexto do README base.
## Critério de conclusão:
- [ ] README base cita runbook
## Ao terminar: rodar `pnpm harness finish 44-doc-runbook-base.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/templates/project/_base/README.md
- tasks/queue/44-doc-runbook-base.md
