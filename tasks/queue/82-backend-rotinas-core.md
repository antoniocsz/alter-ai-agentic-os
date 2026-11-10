# Task: Rotinas — núcleo (schema, agendador, criação de task, dedupe, eventos)
## Agente: `backend` | Módulo: `harness` | Prioridade: P1 | Tipo: feat
## Módulo: `harness`
## Feature: rotinas
## ACs: AC-1, AC-2, AC-3, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/routines.js` (NOVO)
- `scripts/harness/src/task.js` (apenas extrair/preservar criação de task para reuso)
- `scripts/harness/tests/routines.test.js` (NOVO)
## Depende de: —
## Contexto para ler: context/modules/harness/context.md · context/features/rotinas/spec.md · scripts/harness/src/task.js
## Skills a carregar: codegen.md
## O que já existe:
- `task.js::task(args)` cria task na queue a partir de args de CLI (título → arquivo normalizado, escopo, prioridade, tipo, agent, module)
- `lib/db.js` (banco SQLite), `lib/dates.js` (formato de datas), eventos gravados por start/finish
- `.harness/` já é gitignored (routines.json e token moram lá)
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `scripts/harness/src/routines.js` → schema/validação de `.harness/routines.json`; parser de `every` (`15m`, `1h`, `daily@HH:MM`, `weekly@<seg|ter|...>@HH:MM`); cálculo de próxima execução; função `fireRoutine(id)` que cria a task na queue reusando a lógica extraída de task.js; dedupe (título normalizado, considera queue/active); grava eventos de disparo no banco (criada/skip/erro)
- export p/ tasks seguintes: `loadRoutines()`, `fireRoutine()`, `nextRun()`, `startScheduler()` (stub de loop)
## Especificação:
- Rotina inválida: mensagem clara, `serve` não morre (a rotina é ignorada com erro registrado) — o loop em si é task 86, aqui exporta a API
- Disparo = criação de task com: title (normalizado igual `harness task`), scope (lista, opcional), module/priority/type/agent opcionais
- Sem criação de comandos/agentes — v1 só tasks (guard rail da spec, decisão confirmada)
## Critério de conclusão:
- [ ] Tabela de testes do parser cobre: intervalos, daily/weekly cruzando meia-noite, fuso local
- [ ] Dedupe: teste que segunda execução com mesmo título → skip logado, sem arquivo novo
- [ ] Comportamento legado do `harness task` preservado (regressão coberta)
- [ ] `node --test` verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 82`
## Complexidade: média
## Baseline (git): main (queue planejada 2026-11-09)
