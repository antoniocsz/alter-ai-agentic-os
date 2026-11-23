# Plano: orquestracao-paralela

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-23.

## Abordagem

- **`lib/batch.js` (novo)**: `prepareBatch(root, ids)` → valida tudo primeiro (resolve cada id em
  queue/active, recusa `done/`, recusa dependência que esteja no próprio lote, simula conflitos de
  escopo entre as tasks do lote e com as ativas) e só então roda `startTask` + `startWorktree` por
  task. `runBatch({ db, root, items, driverFor, max, signal, onEvent })` → pool de concorrência
  sobre `runTool` (já existente), um `AbortController` filho por run ligado ao sinal do lote.
- **`batch_id`**: coluna nova em `runs` (migração `ALTER TABLE ... ADD COLUMN` idempotente via
  `PRAGMA table_info`), passada por `startRun` ← `runTool({ batchId })`. Id `batch-<timestamp>`.
- **CLI**: `src/run.js` ganha `--batch <ids>` e `--max-parallel`; reaproveita `buildPrompt`,
  `taskWorktree` e `driverFor` (instância de driver por run). `src/runs.js` ganha `--batch <id>`.
- **Canvas**: `lib/canvas.js` inclui `batch_id` no bloco `run`; `kanban.js` mostra o id do lote.
- Um único processo e uma conexão SQLite: os runs são processos filhos; o banco é escrito pelo
  pai de forma síncrona (sem concorrência de escrita).

## Módulos e arquivos afetados

- `scripts/harness/src/lib/batch.js` — novo
- `scripts/harness/src/lib/db.js` — migração `batch_id`
- `scripts/harness/src/lib/runs.js` — `startRun({ batchId })`, `listRuns({ batchId })`
- `scripts/harness/src/lib/runner.js` — repassa `batchId`
- `scripts/harness/src/run.js`, `scripts/harness/src/runs.js` — flags
- `scripts/harness/src/lib/canvas.js`, `scripts/harness/src/kanban.js` — id do lote no cartão
- `README.md`, `AGENTS.md` — docs

## Ordem de tasks

1. `100` — núcleo: `batch_id`, `lib/batch.js` (prepare + pool), `run --batch`. depende de: —
2. `101` — `runs --batch` + lote no `/canvas`. depende de: 100
3. `102` — docs (README, AGENTS.md, ajuda). depende de: 101

## Riscos

- Prepare parcial (start ok numa task e falha na seguinte): validar o lote inteiro ANTES de mover
  qualquer arquivo; se ainda assim um passo falhar no meio, reportar exatamente o que ficou
  preparado (tasks ativas/worktrees criadas) — nada é revertido sozinho (guard rail).
- Saída intercalada ilegível → prefixo `[nn]` por linha e resumo final em tabela.
- Muitos agentes ao mesmo tempo estouram cota/custo → padrão conservador (`wip.active`).
