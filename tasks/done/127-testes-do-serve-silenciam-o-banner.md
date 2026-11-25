# Task: testes do serve silenciam o banner
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/tests/runs-api.test.js`
- `scripts/harness/tests/flows-api.test.js`
- `scripts/harness/tests/competitions-api.test.js`
## Depende de: —
## Contexto para ler: CI run 45538783830 (flows-api.test.js: uncaughtException 'Unable to deserialize cloned data')
## Skills a carregar: codegen.md + testing.md
## O que já existe: os testes da API sobem o `harness serve` com `withSilentStdout`, mas esperam o `listening` fora dele — o banner do kanban (texto) sai no stdout do processo de teste, que o runner do node:test usa como canal binário; no CI ele corrompeu uma mensagem.
## O que criar:
- `tests/runs-api.test.js`, `tests/flows-api.test.js`, `tests/competitions-api.test.js` → aguardar o `listening` dentro do `withSilentStdout`
## Especificação: nenhum texto do produto no stdout do processo de teste.
## Critério de conclusão:
- [x] Sem banner na saída dos três arquivos
- [x] CI verde
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 127`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/127-testes-do-serve-silenciam-o-banner.md
