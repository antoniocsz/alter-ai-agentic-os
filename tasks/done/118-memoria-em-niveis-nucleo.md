# Task: memoria em niveis nucleo
## Agente: `backend`
## Módulo: `harness`
## Feature: memoria-em-niveis
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-8
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/memories.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/memory.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/memories.test.js`
## Depende de: —
## Contexto para ler: context/features/memoria-em-niveis/spec.md · context/features/memoria-em-niveis/plan.md · scripts/harness/src/lib/memory.js (sessões/recall)
## Skills a carregar: codegen.md + backend.md
## O que já existe: sessões (`session end/list`), `recall` (LIKE em sessões/notas/eventos/docs), `memory list|prune` (sessões), handoffs no status.md e no banco.
## O que criar:
- `lib/memories.js` (NOVO) → esquema, níveis, add/list/search/show/approve/reject/update/outdate, global
- `lib/db.js` → ensureMemorySchema na migração
- `lib/config.js` → `memory.global` e `memory.budget`
- `src/memory.js` → subcomandos novos (prune de sessões mantido)
- `commands/index.js` → help
- `tests/memories.test.js` (NOVO)
## Especificação: ver spec e plan.
## Critério de conclusão:
- [x] Testes: add/dedupe/TTL/aviso de parecidas; list/search com ranking e filtros; approve/reject/update (cadeia de versões)/outdate; global isolado e lido só com memory.global
- [x] CLI `harness memory` ponta a ponta
- [x] memory.test (sessões) segue verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 118`
## Complexidade: alta

## Baseline (git)
- context/features/memoria-em-niveis/plan.md
- context/features/memoria-em-niveis/spec.md
- tasks/queue/118-memoria-em-niveis-nucleo.md
