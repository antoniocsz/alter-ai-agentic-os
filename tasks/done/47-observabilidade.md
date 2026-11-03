# Task: Observabilidade no report (Fase 8 🟡)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/metrics.js`
- `scripts/harness/tests/report.test.js`
- `README.md`
## Depende de: [x] 46-rastreabilidade-ac.md
## Contexto para ler: F8 🟡 (observabilidade do harness)
## Skills a carregar: codegen.md
## O que criar:
- `report` inclui gates falhos (`gate_failed`) e worktrees finalizadas (`worktree_finished`).
## Critério de conclusão:
- [ ] table/json/csv expõem os novos campos
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 47-observabilidade.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- README.md
- scripts/harness/src/lib/metrics.js
- scripts/harness/tests/report.test.js
- tasks/queue/47-observabilidade.md
