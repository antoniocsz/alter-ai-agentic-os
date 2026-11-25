# Plano: execucao-competitiva

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `lib/competitions.js` (novo): tabelas `competitions`/`competitors`; `createCompetition` (worktrees
  `<task>--<chave>` na branch `compete/<task>/<chave>` a partir do HEAD da worktree da task),
  `runCompetition` (pool de candidatas + juiz), `candidateStats` (numstat + fora do escopo),
  `parseWinner`, `pickCompetitor` (commit na candidata + `merge --squash` na worktree da task),
  `discardCompetition`.
- `run.js`: `prepareRun` aceita `wt` (worktree da candidata) e papel `judge` (só leitura).
- `src/compete.js` (novo): CLI. `lib/runs-api.js` + `lib/canvas.js` + `kanban.js`: API e painel.

## Módulos e arquivos afetados

- `lib/competitions.js`, `src/compete.js`, `tests/compete.test.js`, `tests/competitions-api.test.js` — novos
- `run.js`, `lib/db.js`, `commands/index.js`, fixture `fake-flow-agent.js`, `lib/runs-api.js`, `lib/canvas.js`, `kanban.js`
- `README.md`, `AGENTS.md`

## Ordem de tasks

1. `124` — motor + CLI. depende de: —
2. `125` — API + canvas. depende de: 124
3. `126` — docs. depende de: 125

## Riscos

- N candidatas multiplicam custo → orçamento por run continua valendo; `--max-parallel` limita.
- Worktrees órfãs se o processo cair → `discard` remove pelo registro no banco.
