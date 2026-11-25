# Task: orquestracao encadeada motor e cli
## Agente: `backend`
## Módulo: `harness`
## Feature: orquestracao-encadeada
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/flows.js`
- `scripts/harness/src/flow.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runtimes/codex.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/flows.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-flow-agent.js`
## Depende de: —
## Contexto para ler: context/features/orquestracao-encadeada/spec.md · plan.md · scripts/harness/src/run.js (prepareRun)
## Skills a carregar: codegen.md + backend.md
## O que já existe: `harness run` (prepareRun compartilhado com a API), lote paralelo, orçamento, contexto, memória.
## O que criar:
- `lib/flows.js` (NOVO) → esquema, máquina de estados, runFlow, veredito, diff e guarda do revisor
- `src/flow.js` (NOVO) → CLI `harness flow`
- `run.js` → papéis no prompt/prepareRun
- `lib/db.js` → migração
- `lib/runtimes/codex.js` → `readOnly`
- `commands/index.js` → registro e help
- `tests/flows.test.js` + `fake-flow-agent.js` (NOVOS)
## Especificação: ver spec e plan.
## Critério de conclusão:
- [x] Fluxo completo implementar → revisar (mudanças) → corrigir → revisar (aprovado) com diff e notas no prompt
- [x] --approve review pausa; resume --note; rodadas esgotadas → needs_human; resume concede rodada
- [x] Revisor que altera a worktree / sem veredito falha; resume repete; stop; validação de tools
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 121`
## Complexidade: alta

## Baseline (git)
- context/features/orquestracao-encadeada/plan.md
- context/features/orquestracao-encadeada/spec.md
- tasks/queue/121-orquestracao-encadeada-motor-e-cli.md
