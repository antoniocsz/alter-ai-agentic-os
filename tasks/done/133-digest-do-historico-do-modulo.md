# Task: digest do historico do modulo
## Agente: `backend`
## Módulo: `harness`
## Feature: otimizador-de-contexto
## Prioridade: P1
## Tipo: feat
## ACs: AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/digest.js`
- `scripts/harness/src/context.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/context-digest.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-flow-agent.js`
## Depende de: [ ] `132`
## Contexto para ler: context/features/otimizador-de-contexto/spec.md · scripts/harness/src/lib/context.js (digest no módulo)
## Skills a carregar: codegen.md + backend.md
## O que já existe: otimizador (132) já usa `context/modules/<m>/digest.md` se existir.
## O que criar:
- `lib/digest.js` (NOVO) → prompt, parse do bloco, guarda, gravação
- `src/context.js` → subcomando `digest`
- `commands/index.js` → help
- `tests/context-digest.test.js` (NOVO); `fake-flow-agent.js` → papel de redator
## Especificação: AC-4 da spec.
## Critério de conclusão:
- [x] dry-run, gravação, pacote usa o digest
- [x] Guardas: agente que altera arquivos, resposta sem bloco, módulo inexistente, validações
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 133`
## Complexidade: media

## Baseline (git)
- tasks/queue/133-digest-do-historico-do-modulo.md
