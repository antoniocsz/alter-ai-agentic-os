# Task: evolução do harness — init --workspace + grupo por módulo no board + version/changelog
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/bin/harness.js`
- `scripts/harness/src/version.js` (novo)
- `scripts/harness/templates/kanban/board.html`
- `scripts/harness/tests/version.test.js` (novo)
- `scripts/harness/tests/kanban.test.js`
- `README.md`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: workspace CLI, kanban agregado com detalhes + WIP, handoffs registrados no banco (interactions kind=note content='handoff: ...')
## O que implementar:
- `harness init --workspace <dir> [--source] [--projects-dir]` → delega para `workspace init` (sem subcomando)
- Kanban: toggle "agrupar por módulo" no board (seções por módulo dentro das colunas)
- `harness version [--bump patch|minor|major]` → mostra ou incrementa scripts/harness/package.json + registra interação
- `harness changelog [--out CHANGELOG.md]` → gera CHANGELOG a partir das interações 'handoff:' do banco (novas primeiro)
## Critério de conclusão:
- [ ] `harness init --workspace <dir>` cria workspace (teste spawn)
- [ ] board.html tem toggle de agrupamento por módulo
- [ ] `harness version --bump patch` incrementa e loga (teste)
- [ ] `harness changelog` gera CHANGELOG.md com os handoffs (teste)
- [ ] `pnpm test` passando
- [ ] `pnpm harness check` ok
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 13-evolucao-ergonomia.md`
## Complexidade: média

## Baseline (git)
- context/agents/queue/13-evolucao-ergonomia.md
## Baseline (git)
- context/agents/queue/13-evolucao-ergonomia.md
