# Task: Rastreabilidade AC ↔ spec (Fase 8 🟡)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/task.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/templates/task/task.md.tpl`
- `scripts/harness/tests/feature.test.js`
- `.agents/feature-planning.md`
- `README.md`
## Depende de: [x] 45-memory-prune.md
## Contexto para ler: F8 🟡 (rastreabilidade spec ↔ task ↔ teste)
## Skills a carregar: codegen.md
## O que criar:
- `task --acs AC-1,AC-2` + `## ACs` no template.
- `check`: task com feature e ACs exige que cada AC exista na spec.
## Critério de conclusão:
- [ ] check reprova AC inexistente na spec e aceita AC válido
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 46-rastreabilidade-ac.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- .agents/feature-planning.md
- scripts/harness/src/check.js
- scripts/harness/src/task.js
- scripts/harness/templates/task/task.md.tpl
- scripts/harness/tests/feature.test.js
- tasks/queue/46-rastreabilidade-ac.md
