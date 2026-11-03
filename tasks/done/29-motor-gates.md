# Task: Motor de gates completo (Fase 4)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/finish.js`
- `scripts/harness/src/gates.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/templates/project/web/harness.json`
- `scripts/harness/templates/project/api/harness.json`
- `scripts/harness/templates/project/docs/harness.json`
- `scripts/harness/templates/project/design/harness.json`
- `scripts/harness/tests/gates.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 28-worktree-por-task.md
## Contexto para ler: plano v0.3 (D8, F4; gates por perfil)
## Skills a carregar: codegen.md
## O que já existe:
- `runGates` mínimo (executa scripts do package.json) usado só no worktree finish.
- `harness.json` declara gates por perfil (declarativo até aqui).
## O que criar:
- Gates nativos: `scope` (pipeline), `test:affected`, `links` (docs), `artifact` (design).
- `finish` roda `gates.finish` antes de mover para done; falha bloqueia + evento `gate_failed`.
- Comando `harness gates [finish|merge] [--json]` para rodar manualmente.
- Perfis web/api: `test:affected` no finish; docs: `links`; design: `artifact`.
## Especificação:
- Gate com script ausente ou dependências não instaladas → `skipped` (com motivo), não falha.
- `links`: verifica links relativos em markdown (README, docs/, context/).
- `artifact`: exige ao menos um artefato em `assets/` ou `BRIEF.md` preenchido.
- `test:affected`: vitest `--changed` quando disponível; senão `pnpm run test`.
- `finish` continua validando escopo antes dos gates.
## Critério de conclusão:
- [ ] finish bloqueia quando gate falha e reporta o motivo
- [ ] gates nativos cobertos por teste
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 29-motor-gates.md --handoff "<resumo>"`
## Complexidade: alta

## Baseline (git)
- scripts/harness/src/commands/index.js
- scripts/harness/src/finish.js
- scripts/harness/src/lib/gates.js
- scripts/harness/src/lib/pipeline.js
- scripts/harness/templates/project/design/harness.json
- scripts/harness/templates/project/docs/harness.json
- scripts/harness/templates/project/web/harness.json
- scripts/harness/src/gates.js
- scripts/harness/templates/project/api/harness.json
- scripts/harness/tests/gates.test.js
- tasks/queue/29-motor-gates.md
