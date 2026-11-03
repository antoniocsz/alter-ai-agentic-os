# Task: Retenção de memória — memory prune (Fase 8 🟡)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/src/memory.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/memory.test.js`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 44-doc-runbook-base.md
## Contexto para ler: F8 🟡 (retenção/compactação da memória)
## Skills a carregar: codegen.md
## O que criar:
- `memory prune [--days N] [--apply]`: lista sessões mais velhas que N dias (default 90);
  com `--apply`, move para `context/sessions/archive/YYYY-MM/` e remove a linha do banco.
- Recall continua encontrando arquivos arquivados (varredura markdown recursiva).
## Especificação:
- Sem `--apply` é dry-run (nada muda).
- Nunca apaga conteúdo: apenas arquiva.
## Critério de conclusão:
- [ ] dry-run lista, apply arquiva e banco deixa de listar
- [ ] recall ainda acha sessão arquivada
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 45-memory-prune.md --handoff "<resumo>"`
## Complexidade: baixa/média

## Baseline (git)
- scripts/harness/src/commands/index.js
- scripts/harness/src/lib/memory.js
- scripts/harness/tests/memory.test.js
- scripts/harness/src/memory.js
- tasks/queue/45-memory-prune.md
