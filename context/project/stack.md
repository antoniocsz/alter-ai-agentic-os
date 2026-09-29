# Stack Técnica — Repositório-fonte do harness

## Runtime
- Node.js ≥ 22.5 (usa `node:sqlite` nativo)
- ESM (`"type": "module"`), **zero dependências de runtime**
- Testes: `node:test` (`pnpm test` → `node --test "scripts/harness/tests/*.test.js"`)

## Estrutura deste repositório
- `scripts/harness/` — CLI (`bin/harness.js` + `src/*` + `templates/`)
  - `src/lib/` — helpers (paths, tasks, pipeline, git, db, templates, metrics, workspace)
  - `src/*.js` — comandos (init, module, task, start, finish, requeue, reopen, sync, log, history, report, kanban, check, update, workspace)
  - `templates/` — project (monorepo gerado), module, prisma, task, kanban, workspace
  - `tests/` — node:test (check, db, git, init, pipeline, tasks, templates, version, workspace, kanban)
- `.agents/` — referências modulares (carregadas sob demanda por especialidade)
- `.opencode/agent/` — agents prontos (coordinator, backend, frontend, mobile, reviewer)
- `context/` — dogfood: identidade e pipeline do próprio harness

## Estado e banco
- `.harness/harness.db` — SQLite (tasks, task_events, interactions); gitignored, regenerável via `harness sync`
- `.harness-workspace.json` — registro de workspaces (paths relativos à raiz, resolvidos para absoluto em memória)

## Ferramentas
- `pnpm` — usado apenas para o atalho `pnpm harness` (o CLI roda direto com `node scripts/harness/bin/harness.js`)
- Git — base da validação de escopo (`harness finish` usa `git status`/diff)