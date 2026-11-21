# Task: Execução de agentes — run corrente no /canvas
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Feature: execucao-agentes
## ACs: AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/canvas.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/canvas-runs.test.js`

Anotações do escopo: `canvas.js` ganha o bloco `run` no cartão; `kanban.js` só a renderização desse bloco na vista `/canvas` (nenhuma mudança no board).
## Depende de: 94
## Contexto para ler: context/features/execucao-agentes/spec.md · context/features/agent-canvas/spec.md · scripts/harness/src/lib/canvas.js · scripts/harness/src/lib/runs.js
## Skills a carregar: codegen.md + ui-ux.md
## O que já existe:
- `canvasState(ctx)` com cartão por task ativa (tasks 84/85); vista `/canvas` com auto-refresh 3s
- `runs`/`run_events` (task 93) e runs reais do Claude (task 94)
## O que criar:
- `cardFor` → campo `run`: run mais recente da task `{ id, tool, model, status, started_at, last_agent_event: {type, summary, at}, tokens_in, tokens_out, cost_usd, measured }` ou `null`
- `last_activity_at`/staleness passam a considerar o último `run_event`
- Vista `/canvas`: linha do run no cartão (tool + status, último evento do agente, tokens e custo com rótulo "medido"/"n/d")
## Especificação:
- Sem run → cartão idêntico ao atual (regressão coberta)
- db indisponível → `run: null` (degradação igual à existente)
- Nada de estimativa: valores ausentes aparecem como "n/d"
## Critério de conclusão:
- [ ] `canvasState` com run em curso, run concluído e sem run — teste
- [ ] Staleness considera `run_events` — teste
- [ ] `GET /api/canvas` inclui `run`; HTML do `/canvas` renderiza a linha do run — teste
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 95`
## Complexidade: baixa
