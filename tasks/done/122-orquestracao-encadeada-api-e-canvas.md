# Task: orquestracao encadeada api e canvas
## Agente: `frontend`
## Módulo: `harness`
## Feature: orquestracao-encadeada
## Prioridade: P1
## Tipo: feat
## ACs: AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/lib/canvas.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/flows-api.test.js`
## Depende de: [ ] `121`
## Contexto para ler: context/features/orquestracao-encadeada/spec.md · scripts/harness/src/lib/runs-api.js · scripts/harness/src/kanban.js
## Skills a carregar: codegen.md + frontend.md
## O que já existe: motor do fluxo e CLI (121); API local de runs e canvas interativo (115, 116).
## O que criar:
- `lib/runs-api.js` → `/api/flows` (listar, ver, iniciar, retomar, parar); fluxo em segundo plano; run e fluxo não coexistem na task
- `lib/canvas.js` → fluxo mais recente no cartão
- `kanban.js` → "🔗 Fluxo", "▶ Continuar fluxo", "■ Parar fluxo", etapas com veredito
- `tests/flows-api.test.js` (NOVO)
## Especificação: AC-5 da spec.
## Critério de conclusão:
- [x] API: inicia em segundo plano, pausa, retoma com nota, conclui; cartão com etapas
- [x] Validações, unsafe, 409 com run/fluxo em andamento, stop
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 122`
## Complexidade: media

## Baseline (git)
- tasks/queue/122-orquestracao-encadeada-api-e-canvas.md
