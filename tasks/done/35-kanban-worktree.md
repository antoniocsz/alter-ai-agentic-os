# Task: Workspace final na raiz + badge de worktree no kanban (Fase 7)
## Agente: `coordinator` (workspace)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/kanban.js`
- `scripts/harness/templates/kanban/board.html`
- `scripts/harness/tests/kanban.test.js`
## Depende de: [x] 34-dor-prioridade.md
## Contexto para ler: plano v0.3 (F7 workspace + kanban)
## Skills a carregar: codegen.md
## O que já existe:
- Workspace registry e comandos agregados.
- Kanban já agrupa por módulo; não mostra worktree ativa.
## O que criar:
- Badge da worktree no card (branch) lendo `.harness/worktrees.json` do projeto dono.
- Teste de `buildBoard` cobrindo o campo `worktree`.
## Especificação:
- Projeto único e workspace agregado usam o registry de cada projeto.
- Sem worktree → sem badge.
## Critério de conclusão:
- [ ] card mostra branch quando há worktree
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 35-kanban-worktree.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/kanban.js
- scripts/harness/templates/kanban/board.html
- tasks/queue/35-kanban-worktree.md
