# Task: Aceitar prefixo numérico curto em start/finish (dogfood)
## Agente: `coordinator` (bugfix)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/tasks.js`
- `scripts/harness/tests/tasks.test.js`
## Depende de: [x] 35-kanban-worktree.md
## Contexto para ler: dogfood no demo-script (sugestão `harness start 1` falhou)
## Skills a carregar: —
## O que já existe:
- `resolveTaskName` exige `01` (arg + '-'), mas o `task` sugere `start 1`.
## O que criar:
- Prefixo numérico curto aceito: `1` resolve `01-...`.
## Especificação:
- `1` → `01-x.md`; `01` continua funcionando; ambíguo continua errando.
## Critério de conclusão:
- [ ] `start 1` e `start 01` resolvem a mesma task
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 36-prefixo-numerico.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/lib/tasks.js
- scripts/harness/tests/tasks.test.js
- tasks/queue/36-prefixo-numerico.md
