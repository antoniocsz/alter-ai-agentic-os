# Task: Correções de validação de pipeline (parser de escopo + merges intercalados)
## Agente: `backend` | Módulo: `harness` | Prioridade: P2 | Tipo: fix
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/tasks.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/tests/pipeline-cross.test.js`

Anotações do escopo: `tasks.js` para o parser de escopo; `pipeline.js`/`worktree.js` para a validação de escopo no finish/worktree finish; teste novo cobre os dois.

## Depende de: —

## Contexto para ler: context/modules/harness/context.md · context/modules/harness/status.md (handoffs 82–84) · scripts/harness/src/lib/tasks.js (parseTask, L58–69) · scripts/harness/src/lib/pipeline.js (L130–180)
## Skills a carregar: codegen.md
## O que já existe (tasks 82–84, ciclo Superfik):
- Descobertas registradas no lote 1 (2026-11-09), ambas bloqueiam o fluxo paralelo:
  1. `parseTask` (lib/tasks.js L62–67) aceita APENAS `- \`path\`` nos bullets de escopo: anotações como `- \`path\` (NOVO)` deixam lixo no path (crase só é removida de ponta a ponta da linha) e o finish reprova arquivos dentro do escopo real. Workaround usado: normalizar os task files na mão.
  2. `finishTask`/worktree scope check (lib/pipeline.js L161; lib/worktree.js L195) valida `git diff <startHead> → HEAD` — com worktrees paralelas mergeando intercalado, os arquivos de outra task (já mergeada antes do startHead da atual) caem como "fora do escopo". Workaround usado nas tasks 83/84: anotar os arquivos intercalados no `## Baseline (git)` da task ativa.
- Suíte: 181/181 verdes pós lote 1.
- NÃO rodar via `pnpm harness` nesta máquina (Execution Policy bloqueia pnpm.ps1) — usar `node scripts/harness/bin/harness.js ...`
## O que criar:
- `parseTask`: extrair o PRIMEIRO caminho entre crases do bullet (`/\`([^\`]+)\`/`) em vez de strip de pontas — anotações depois do path viram ignoradas; quando não há crases, comportamento atual (path puro até delimitador) — compatível com tasks antigas em done/
- Validação de escopo: diff de escopo deve partir do **próprio startHead da task** e IGNORAR arquivos que já entraram no HEAD por merges de worktrees intercaladas (comparar merge-base / attributes de task distinta) — alternativa correta: per-task head tracking por task no evento `worktree_started`/db (ex.: hash por id) em vez de única interação `head:` global
- Manter bloqueio real: arquivos FORA do escopo que a task alterou continuam reprovando
- Testes: parseTask com anotações; validação de escopo com merges intercalados (fixture simulando 2 tasks paralelas)
## Especificação:
- Nenhum gate novo; comportamento esperado documentado no teste (contrato)
- Atualizar os handoffs: referenciar esse débito nos status.md (feito nas tasks 82–84)
## Critério de conclusão:
- [ ] `- \`path\` (NOVO)` parseia path limpo; `- path` legado igual
- [ ] Fixa fixture de merges intercalados: task B com startHead anterior ao merge de task A fecha SEM anotação de Baseline e SEM reprovar arquivos da A
- [ ] Task que realmente toca arquivo fora do escopo continua bloqueada (teste negativo)
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 90`
## Complexidade: média
## Baseline (git): main pós-lote 1 do ciclo Superfik (2026-11-09)
