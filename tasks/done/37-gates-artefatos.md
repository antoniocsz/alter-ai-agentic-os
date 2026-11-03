# Task: Limpar artefatos criados pelos gates (dogfood)
## Agente: `coordinator` (bugfix)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/tests/gates.test.js`
## Depende de: [x] 36-prefixo-numerico.md
## Contexto para ler: dogfood demo-script (pnpm-lock.yaml criado por `pnpm run`, quebrando worktree remove)
## Skills a carregar: —
## O que já existe:
- gates executam `pnpm run <script>`; pnpm pode criar `pnpm-lock.yaml` como efeito colateral.
## O que criar:
- Executar gate preservando o estado: se `pnpm-lock.yaml` não existia antes, removê-lo depois.
## Especificação:
- Lockfile pré-existente nunca é apagado.
- Vale para `test:affected` e gates nomeados.
## Critério de conclusão:
- [ ] gate que cria pnpm-lock.yaml não deixa resíduo
- [ ] lockfile existente é preservado
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 37-gates-artefatos.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/lib/gates.js
- scripts/harness/tests/gates.test.js
- tasks/queue/37-gates-artefatos.md
