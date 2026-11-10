# Task: `## Tipo` compacto não é parseado (squash usa feat em vez do tipo declarado)
## Agente: `backend` | Módulo: `harness` | Prioridade: P3 | Tipo: fix
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/tasks.js`
- `scripts/harness/tests/pipeline-cross.test.js`

Anotações do escopo: `tasks.js` para o parser de metadata compacta; o teste existente de pipeline ganha as variantes do header compacto.

## Depende de: —

## Contexto para ler: context/modules/harness/status.md (handoff da task 89) · scripts/harness/src/lib/tasks.js (parseTask) · scripts/harness/src/lib/commits.js (commitForTask)
## Skills a carregar: codegen.md
## O que já existe:
- Tasks 89/91 e muitas antigas usam header compacto `## Agente: `agente` | Módulo: `harness` | Prioridade: P2 | Tipo: docs` — mas `parseTask` só extrai `values['Tipo']` de um heading `## Tipo:` DEDICADO
- Resultado real: o squash da 89 saiu `feat(task-89)` em vez do `docs(task-89)` declarado (descoberta registrada no relatório da 89)
- Pós-task 90, `parseTask` já extrai paths de bullets com anotações (primeiro bloco entre crases)
- Suíte baseline: 236/236; NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js ...`; zero deps
## O que criar:
- Extração dos campos do header compacto (Agente | Módulo | Prioridade | Tipo — e qualquer `X: valor` no formato ` | `) para `values` equivalentes ao heading dedicado; heading dedicado tem precedência
- Backfill não retroativo: tasks antigas em done/ não são reescritas; só o parse passa a ler o que já existe
- Testes: header compacto com e sem `Tipo`, com e sem heading dedicado, precedência do dedicado, sanitize de valores com backticks
## Especificação:
- Nenhum gate novo; commitForTask passa a receber o tipo parseado corretamente (squash de task `## Tipo: docs` vira `docs(task-n)`)
## Critério de conclusão:
- [ ] Teste de fim-a-fim: `finish` de task fixture com header compacto `Tipo: docs` gera commit `docs(task-<n>)` (verificado no registro do squash / fixture)
- [ ] Suíte completa verde (≥236); `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 92`
## Complexidade: baixa
## Baseline (git): main pós-ciclo Superfik (v0.4.0, 2026-11-10)
