# Task: Rotinas — `harness serve` + webhook com token
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: rotinas
## ACs: AC-4, AC-5, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/serve.js` (NOVO)
- `scripts/harness/src/routines.js` (apenas API de disparo/scheduler na integração)
- `scripts/harness/src/kanban.js` (rota `POST /webhook/routines/:id` + payload `/api/routines`)
- `scripts/harness/src/commands/index.js` (registro do comando `serve`)
- `scripts/harness/tests/serve.test.js` (NOVO)
## Depende de: 82-backend-rotinas-core.md, 85-backend-canvas-ui.md
## Contexto para ler: context/modules/harness/context.md · context/features/rotinas/spec.md · scripts/harness/src/routines.js · scripts/harness/src/kanban.js (serveBoard) · context/modules/harness/status.md (handoffs 82/84/85)
## Skills a carregar: codegen.md
## O que já existe (pós-82 e 85):
- routines.js com `loadRoutines`, `fireRoutine`, `nextRun`, `startScheduler` (criação de task reusada de task.js)
- kanban.js com board + `/api/canvas` funcionando (task 84/85)
- `.harness/` gitignored;lock/heartbeat existem para serializar pipelines
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `scripts/harness/src/serve.js` → comando `harness serve [--port n]`: um processo com (1) servidor HTTP do kanban (reuso `serveBoard`), (2) scheduler das rotinas (interval/timers), (3) rota `POST /webhook/routines/:id?token=` (401 sem/errado token); token gerado com `crypto.randomUUID` e salvo em `.harness/webhook-token` (1ª execução), comparação em tempo const
- Payload `GET /api/routines` (id, título, every, próxima/última execução, total de disparos) p/ painel da 88
- Eventos de disparo no banco (webhook recebido, rotina rodou, task criada/skip) — via mesmos helpers de interações
- Shutdown gracioso (SIGINT/SIGTERM: parar timers e fechar servidor); bind 127.0.0.1 default; `--host` explícito imprime warning
- `commands/index.js`: entrada `serve`
## Especificação:
- Rotina inexistente no webhook → 404; JSON malformado no routines.json → rotina ignorada e erro logado (não derruba servidor — AC-1 já coberto no core, aqui só respeito do load)
- Webhook com dedupe → skip logado + 200 com resultado declarado
## Critério de conclusão:
- [ ] Testes: webhook happy-path cria task; 401 sem token; 404 rotina inexistente; token persistido e reutilizado entre execuções
- [ ] Testes: serve sobe em porta efêmera e termina sem pendurar processo
- [ ] `node --test` verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 86`
## Complexidade: alta
## Baseline (git): main (queue planejada 2026-11-09)
