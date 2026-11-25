# Plano: memoria-em-niveis

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-24.

## Abordagem

- `lib/memories.js` (novo): `ensureMemorySchema(db)`, `openGlobalDb()`, `addMemory`, `listMemories`,
  `searchMemories`, `getMemory`/`memoryChain`, `setStatus` (approve/reject/outdate), `updateMemory`
  (versão), `retrieveForTask` (ranking + orçamento), `parseMemoryBlock` + `harvestRunMemories`.
- FTS5 (`unicode61 remove_diacritics 2`) com rowid = id; sem FTS5 disponível, cai para LIKE.
- Ranking: bm25 normalizado × peso do nível (task 1.0, knowledge 0.9, agent 0.8, project 0.7,
  global 0.5) × confiança × recência (meia-vida 90 dias); `fact`/`decision` antes de
  `assumption`/`observation` no empate.
- `db.js` chama `ensureMemorySchema` na migração; `config.js` valida `memory.global` e
  `memory.budget` (tokens da seção, padrão 1500).
- `src/memory.js`: novos subcomandos (o `prune` de sessões continua; `list` passa a listar
  memórias — sessões seguem em `harness session list`).
- `lib/context.js`: seção `memory` depois de `deps`. `run.js`/`batch`/`runs-api`: colheita do
  bloco `MEMÓRIA:` no fim do run; `buildPrompt` pede o bloco.

## Módulos e arquivos afetados

- `lib/memories.js`, `tests/memories.test.js` — novos
- `lib/db.js`, `lib/config.js`, `src/memory.js`, `commands/index.js`
- `lib/context.js`, `src/run.js`, `lib/runs-api.js`, `lib/batch.js`
- `README.md`, `AGENTS.md`

## Ordem de tasks

1. `118` — núcleo: esquema, níveis, CLI, global, versões. depende de: —
2. `119` — integração: contexto por relevância e colheita do agente. depende de: 118
3. `120` — docs. depende de: 119

## Riscos

- Ranking só textual pode trazer memória pouco relevante → orçamento próprio e limite de itens.
- Agente propondo memórias demais → entram como `proposed` e não chegam ao contexto sem aprovação.
