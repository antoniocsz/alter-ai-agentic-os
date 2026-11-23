# Plano: orcamento-de-custos

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-23.

## Abordagem

- `lib/budget.js` (novo): `readBudget(cfg)`, `usageSummary(db, { now })` (soma de runs medidos por
  task, dia local e mês local; conta não medidos), `checkBudget(db, budget, { taskId, now })` →
  `{ ok, violations[], remaining }`, `effectiveRunLimit(budget, remaining)` → `{ tokens, usd }`.
- `lib/config.js`: `budget` no `validateConfig` (sem default — ausente = sem limite).
- `src/budget.js` (novo): comando `harness budget`.
- Enforcement: `run.js` faz a checagem prévia (`--ignore-budget`), passa `limit` ao `runTool`;
  `runner.js` compara o uso parcial (`meta.usage`) com o limite e mata a árvore (`budget`);
  `batch.js` checa antes de cada job (`skipped`); `runs` ganha `budget_override` (migração);
  `claude.js` emite uso parcial a partir de `assistant.message.usage` deduplicado por `message.id`.

## Módulos e arquivos afetados

- `lib/budget.js`, `src/budget.js` — novos
- `lib/config.js`, `commands/index.js`
- `lib/runner.js`, `lib/batch.js`, `lib/runs.js`, `lib/db.js`, `lib/runtimes/claude.js`, `src/run.js`
- `README.md`, `AGENTS.md`

## Ordem de tasks

1. `106` — agregação, validação e `harness budget`. depende de: —
2. `107` — enforcement (prévio, durante o run, lote, Claude parcial). depende de: 106
3. `108` — docs. depende de: 107

## Riscos

- Uso parcial do Claude por mensagem pode divergir do total final → o `result` sempre prevalece no
  registro; o parcial só serve para cortar.
- Runs sem uso reportado deixam o consumido subestimado → sempre informado na saída.
