# Task: otimizador de contexto compactacao e medicao
## Agente: `backend`
## Módulo: `harness`
## Feature: otimizador-de-contexto
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/context.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/context.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/context-optimizer.test.js`
- `scripts/harness/tests/run-context.test.js`
## Depende de: —
## Contexto para ler: context/features/otimizador-de-contexto/spec.md · plan.md · scripts/harness/src/lib/context.js
## Skills a carregar: codegen.md + backend.md
## O que já existe: pacote de contexto com orçamento (seção que não cabe sai inteira), 3 handoffs inteiros.
## O que criar:
- `lib/context.js` → compactHandoff, outline, optimize, medição
- `lib/config.js` → `context.optimize`
- `src/context.js` → `--stats`, `--full`
- `run.js` → economia no `context_built`
- `tests/context-optimizer.test.js` (NOVO); `tests/run-context.test.js` → aceita seção resumida
## Especificação: AC-1 a AC-3 da spec.
## Critério de conclusão:
- [x] Handoffs compactados; resumo antes de omitir; economia medida; --full/optimize false
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 132`
## Complexidade: media

## Baseline (git)
- context/features/otimizador-de-contexto/plan.md
- context/features/otimizador-de-contexto/spec.md
- tasks/queue/132-otimizador-de-contexto-compactacao-e-medicao.md
