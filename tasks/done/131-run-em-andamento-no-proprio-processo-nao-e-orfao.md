# Task: run em andamento no proprio processo nao e orfao
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P0
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/tests/runs.test.js`
- `scripts/harness/tests/competitions-api.test.js`
## Depende de: —
## Contexto para ler: CI run 45544427981 (competitions-api.test.js: juiz não rodou) · scripts/harness/src/lib/runs.js (reapOrphans)
## Skills a carregar: codegen.md + backend.md
## O que já existe: `prepareRun` chama `reapOrphans`, que marca como órfão todo run `running` com pid morto. No mesmo processo (serve, lote, competição), entre o fim do processo do agente e o `close` dos pipes, o run ainda está `running` com pid morto: outro dispatch nesse intervalo o fechava como `failed/orphaned` (reproduzido 2 em 6 execuções: candidata da competição virava órfã e o juiz não rodava).
## O que criar:
- `lib/runs.js` → `inFlightRuns` (runs acompanhados por este processo); `reapOrphans` os ignora
- `lib/runner.js` → registra o run ao abrir e retira ao fechar
- `tests/runs.test.js` → teste do caso
- `tests/competitions-api.test.js` → mensagem de falha com o estado das candidatas
## Especificação: run deste processo nunca é órfão; órfão só de processo morto que ninguém acompanha.
## Critério de conclusão:
- [x] Teste unitário do inFlightRuns
- [x] competitions-api 6/6 sem falha (antes 2/6)
- [x] Suíte completa verde; CI verde
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 131`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/131-run-em-andamento-no-proprio-processo-nao-e-orfao.md
