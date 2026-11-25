# Plano: otimizador-de-contexto

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `lib/context.js`: `compactHandoff`, `outline`, opção `optimize` (padrão do `harness.json`),
  `full_tokens`/`compacted`/`outline` por seção, `saved_tokens` no pacote; digest no módulo.
- `src/context.js`: `--stats`, `--full`; subcomando `digest`. `run.js`: economia no `context_built`.
- `lib/digest.js` (novo): prompt, parse do bloco, guarda por comparação da árvore, gravação.

## Módulos e arquivos afetados

- `lib/context.js`, `lib/config.js`, `src/context.js`, `run.js`, `commands/index.js`, `lib/digest.js`
- testes `context-optimizer.test.js`, `context-digest.test.js`, `run-context.test.js`, fixture `fake-flow-agent.js`
- `README.md`, `AGENTS.md`

## Ordem de tasks

1. `132` — compactação, resumo e medição. depende de: —
2. `133` — digest do módulo. depende de: 132
3. `134` — docs. depende de: 133

## Riscos

- Compactação esconder um detalhe que importava → o pacote aponta a fonte; `--full` e `optimize: false`.
- Digest desatualizado → cabeçalho com data e handoff mais recente; gerar de novo.
