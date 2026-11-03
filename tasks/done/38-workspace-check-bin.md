# Task: workspace check --all resolve o CLI do projeto (dogfood)
## Agente: `coordinator` (bugfix)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/workspace.js`
- `scripts/harness/tests/workspace.test.js`
## Depende de: [x] 37-gates-artefatos.md
## Contexto para ler: dogfood (workspace check --all falhou em D:\projetos)
## Skills a carregar: —
## O que já existe:
- `runInProject` usa `${wsRoot}/scripts/harness/bin/harness.js` (modelo antigo: camada na raiz).
- Nova arquitetura: CLI vive em cada projeto (e/ou no kit via `harnessSource`).
## O que criar:
- Resolver o binário: projeto → raiz do workspace (legado) → harnessSource do registry.
- Teste: workspace sem scripts na raiz, mas com camada nos projetos, passa `check --all`.
## Especificação:
- Erro claro se nenhum binário for encontrado.
## Critério de conclusão:
- [ ] `workspace check --all` funciona no workspace D:\projetos
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 38-workspace-check-bin.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/workspace.js
- scripts/harness/tests/workspace.test.js
- tasks/queue/38-workspace-check-bin.md
