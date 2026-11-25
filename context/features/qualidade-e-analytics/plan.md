# Plano: qualidade-e-analytics

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `lib/gates.js`: `runGatesAsync` (runGates num processo Node filho) e `qualityOf`.
- `lib/runner.js`: `runTool({ gates })` roda os gates depois do run concluído; eventos
  `quality.gate` (novo tipo em `lib/runs.js`) e `runs.quality` (migração em `lib/db.js`).
- `run.js`: `runGatesFor(root, flags)` (`gates.run`, `--no-gates`) no `prepareRun` (implementar e
  corrigir; revisor/juiz não); `batch`, `runs-api`, `flows`, `competitions` repassam.
- `lib/analytics.js` (novo) + `src/analytics.js` (CLI) + `kanban.js` (`/analytics`, `/api/analytics`).

## Módulos e arquivos afetados

- `lib/gates.js`, `lib/runner.js`, `lib/runs.js`, `lib/db.js`, `lib/config.js`, `run.js`, `runs.js`,
  `lib/batch.js`, `lib/runs-api.js`, `lib/flows.js`, `lib/competitions.js`, `compete.js`, `lib/canvas.js`, `kanban.js`
- `lib/analytics.js`, `src/analytics.js`, `commands/index.js`
- testes `quality.test.js`, `analytics.test.js`; `README.md`, `AGENTS.md`

## Ordem de tasks

1. `128` — gates pós-run. depende de: —
2. `129` — analytics (CLI, API, painel). depende de: 128
3. `130` — docs. depende de: 129

## Riscos

- Testes longos depois de cada run → processo separado e `--no-gates`.
- Worktree sem node_modules → gate de script pulado (ou falha em strict).
