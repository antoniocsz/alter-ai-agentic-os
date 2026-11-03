# Task: Mover pipeline de context/agents para tasks/ e criar fallback legado (Fase 1)
## Agente: `coordinator` (refatoração estrutural no kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/tasks.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/init.js`
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/lib/workspace.js`
- `scripts/harness/templates/project/tasks`
- `scripts/harness/templates/project/context/agents`
- `scripts/harness/templates/project/README.md`
- `.opencode/agent/`
- `scripts/harness/tests/init.test.js`
- `scripts/harness/tests/workspace.test.js`
- `AGENTS.md`
- `README.md`
- `.agents/context-interview.md`
- `.agents/feature-planning.md`
- `.agents/orchestration.md`
## Depende de: [x] 20-migracao-kit-workspace.md
## Contexto para ler: AGENTS.md (protocolo); plano v0.3 (arquitetura de pastas)
## Skills a carregar: codegen.md
## O que já existe:
- Pipeline em `context/agents/{queue,active,done}` (constante `AGENTS_DIR` em `lib/tasks.js`).
- Templates de projeto criam `context/agents/*`; workspace onboarding também.
## O que criar:
- Pipeline passa a viver em `tasks/{queue,active,done}`.
- `lib/tasks.js`: `pipelineRoot(root)` com fallback para `context/agents` quando `tasks/` não existir (projetos antigos continuam funcionando).
- Template de projeto: `templates/project/context/agents` → `templates/project/tasks`.
- `init`/`workspace add` criam `tasks/*`; `--bare` limpa `tasks/queue`.
- Kit dogfood migrado de `context/agents` → `tasks`.
- Docs (AGENTS.md, README, .agents/*) atualizados para `tasks/queue` etc.
## Especificação:
- Não quebrar projetos legados: se `tasks/` ausente e `context/agents/` presente, usa o legado.
- Sem mudanças de comportamento no pipeline (mesmos comandos start/finish/requeue/reopen/sync/check).
- Testes de pipeline existentes que usam fixtures legadas devem continuar verdes (valida o fallback).
- Tests de `init`/`workspace` passam a exigir `tasks/*`.
## Critério de conclusão:
- [ ] `tasks/{queue,active,done}` no projeto gerado por `harness init`
- [ ] Fallback legado coberto (tests antigos verdes)
- [ ] `pnpm test` verde
- [ ] `pnpm harness check` limpo
## Ao terminar: rodar `pnpm harness finish 21-pipeline-tasks-dir.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- context/agents/queue/21-pipeline-tasks-dir.md
