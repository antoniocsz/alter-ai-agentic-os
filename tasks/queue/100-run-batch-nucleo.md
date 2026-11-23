# Task: run batch nucleo
## Agente: `backend`
## Módulo: `harness`
## Feature: orquestracao-paralela
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/batch.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/batch.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/features/orquestracao-paralela/spec.md · plan.md · scripts/harness/src/run.js · scripts/harness/src/lib/runner.js · scripts/harness/src/lib/pipeline.js (startTask/checkDoR) · scripts/harness/src/lib/worktree.js
## Skills a carregar: codegen.md
## O que já existe: `harness run <task> --tool` (runTool, drivers claude/codex/opencode com `create()`), `startTask` (DoR + conflito de escopo), `startWorktree`, `findConflicts`, `resolveConfig().wip.active`. NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `lib/db.js` → migração idempotente da coluna `runs.batch_id` (PRAGMA table_info + ALTER TABLE)
- `lib/runs.js` → `startRun({ batchId })`, `listRuns({ batchId })`, `newBatchId()`
- `lib/runner.js` → `runTool({ batchId })` repassa ao `startRun`
- `lib/batch.js` (NOVO) → `planBatch` (validação sem efeito colateral), `prepareBatch` (start + worktree start), `runBatch` (pool com limite e AbortSignal do lote)
- `src/run.js` → `--batch <ids>` + `--max-parallel <n>`; saída com prefixo `[nn]` e resumo final
- `tests/batch.test.js` (NOVO)
## Especificação: ver spec (AC-1..AC-5, AC-7). Validação do lote inteiro antes de mover qualquer arquivo: id inexistente/ambíguo, task em done/, dependência no próprio lote, conflito de escopo entre tasks do lote e com ativas, DoR. Falha no meio da preparação → reportar o que ficou preparado (sem reverter). `--max-parallel` inteiro ≥ 1 (padrão `wip.active`, mínimo 1). Interrupção cancela pendentes e mata os ativos.
## Critério de conclusão:
- [ ] Teste: planBatch recusa (done/, dependência interna, conflito de escopo interno) sem mover arquivos
- [ ] Teste: lote de 3 com max 2 → nunca mais de 2 simultâneos (executável falso que registra início/fim)
- [ ] Teste: falha de um não interrompe os outros; exit code 1 no CLI
- [ ] Teste: abort do lote → ativos `interrupted`, pendentes não iniciados
- [ ] Teste: runs gravam batch_id; migração em banco antigo
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 100`
## Complexidade: alta
