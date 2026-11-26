# Task: workspace do app: conversa, mudancas e gates por task
## Agente: `frontend`
## Módulo: `harness`
## Feature: workspace-app
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/workspace-page.js`
- `scripts/harness/src/lib/workspace-page.html`
- `scripts/harness/src/lib/changes.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/runtimes.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/workspace-page.test.js`
- `apps/desktop/src/main.js`
- `apps/desktop/README.md`
- `README.md`
- `AGENTS.md`
- `context/modules/harness/status.md`
- `context/features/workspace-app/spec.md`
- `context/features/workspace-app/plan.md`
## Depende de: [x] `139`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + frontend.md
## O que já existe: conversa contínua (139): `/api/conversation`, `continue` no `POST /api/runs`; canvas clássico em `/canvas`.
## O que criar:
- `scripts/harness/src/lib/workspace-page.{js,html}` → página /workspace (barra lateral, conversa, painel)
- `scripts/harness/src/lib/changes.js` → mudanças da worktree × base e patch por arquivo
## Especificação: ver context/features/workspace-app/spec.md (AC-1..AC-4) e plan.md.
## Critério de conclusão:
- [ ] `/workspace` funciona no `harness serve` (verificado em navegador headless com agente falso)
- [ ] `/api/changes` e `note` cobertos por testes
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 140-workspace-do-app-conversa-mudancas-e-gates-por-t.md`
## Complexidade: alta

## Baseline (git)
- context/features/workspace-app/plan.md
- context/features/workspace-app/spec.md
- tasks/queue/140-workspace-do-app-conversa-mudancas-e-gates-por-t.md
