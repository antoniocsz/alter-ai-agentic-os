# Plano: orquestracao-encadeada

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `lib/flows.js` (novo): esquema `flows`/`flow_steps`, `createFlow`, `nextStep` (máquina de
  estados a partir do histórico), `runFlow` (executa até pausar/terminar; `prepare` e `worktree`
  injetados), `parseVerdict`, `worktreeDiff`, `worktreeSignature` (guarda do revisor),
  `resumeFlow`, `stopFlow`.
- `run.js`: `buildPrompt`/`prepareRun` com `role` (`implement`/`review`/`fix`) e `extra`; revisor
  com `opts.readOnly` (Codex `read-only`) e Claude em `plan`; exporta `printRunEvent`/`withSigint`.
- `src/flow.js` (novo): CLI. `lib/runs-api.js`: rotas `/api/flows*`, fluxo em segundo plano no serve.
  `lib/canvas.js`: fluxo no cartão. `kanban.js`: controles no canvas.

## Módulos e arquivos afetados

- `lib/flows.js`, `src/flow.js`, `tests/flows.test.js`, `tests/flows-api.test.js`, fixture `fake-flow-agent.js` — novos
- `run.js`, `lib/db.js`, `lib/runtimes/codex.js`, `commands/index.js`, `lib/runs-api.js`, `lib/canvas.js`, `kanban.js`
- `README.md`, `AGENTS.md`

## Ordem de tasks

1. `121` — motor do fluxo + CLI. depende de: —
2. `122` — API e canvas. depende de: 121
3. `123` — docs. depende de: 122

## Riscos

- Veredito depende do formato do texto do agente → regex tolerante (markdown, pt/en); sem veredito
  a etapa falha e o humano decide.
- Revisor de tool sem modo leitura (Gemini, OpenCode) → guarda por comparação da worktree.
