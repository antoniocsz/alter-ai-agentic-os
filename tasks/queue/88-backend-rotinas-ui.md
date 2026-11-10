# Task: Rotinas — painel no board (próxima/última execução, rodar agora)
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: feat
## Módulo: `harness`
## Feature: rotinas
## ACs: AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/kanban.js` (painel de rotinas no board)
- `scripts/harness/tests/kanban.test.js` (testes do painel)
## Depende de: [ ] 86-backend-serve-webhook.md (payload e rota; kanban.js sequencial)
## Contexto para ler: context/modules/harness/context.md · context/features/rotinas/spec.md (AC-7) · scripts/harness/src/kanban.js · scripts/harness/src/serve.js · context/modules/harness/status.md (handoff da 86)
## Skills a carregar: codegen.md
## O que já existe (pós-86):
- `harness serve` unificado (kanban + scheduler + webhook) com token em `.harness/webhook-token`
- `GET /api/routines` serve id, título, every, próxima/última execução, disparos
- `POST /webhook/routines/:id?token=` dispara (dedupe é respeitado)
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- Painel "Rotinas" no board (seção lateral/toggle, mesma estética da vista canvas): lista de rotinas do routines.json quando existir — id, título, `every`, próxima execução, última execução, total de disparos
- Botão "rodar agora" por rotina → chama `POST /webhook/routines/:id` com o token lido do arquivo local (o servidor vivo no processo `serve` o tem); feedback por toast (task criada/skip/erro) igual aos moves
- Kanban standalone (`harness kanban --serve`) sem routines.json → painel não aparece (degradação graciosa); com routines.json mas sem scheduler → mostra "inativo — rode `harness serve`"
## Especificação:
- O painel é a única surface de "run now"; nada de edição de routines.json pela UI
- Segue o padrão do board: sem framework, HTML renderizado server-side + JS inline
## Critério de conclusão:
- [ ] Painel visível no modo serve com routines.json; resultado de "rodar agora" mostrado (criada/skip/401)
- [ ] Degradação graciosa (sem routines.json / sem scheduler)
- [ ] `node --test` verdes; `harness check` ok; board sem regressão
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 88`
## Complexidade: baixa
## Baseline (git): main (queue planejada 2026-11-09)
