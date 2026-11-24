# Plano: api-local

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-24.

## Abordagem

- `run.js`: extrair `prepareRun(root, flags, arg, db)` (validações + orçamento + contexto + prompt)
  do `runCmd` — o CLI e a API usam o mesmo caminho.
- `runner.js`: `runTool({ runId })` aceita id pré-gerado (a API responde com ele antes do fim).
- `runtimes.js`: extrair `detectRuntimes(env)`.
- `lib/runs-api.js` (novo): `createRunsApi(root, { env, allowUnsafe })` → `runtimes()`, `list()`,
  `get(id, after)`, `dispatch(body)`, `stop(id)`; mantém AbortController por run em memória e um
  banco aberto por run em andamento.
- `serve.js`: token de sessão (`randomUUID`), `.harness/serve.json`, `--allow-unsafe`, passa
  `extras.runs` ao `serveBoard`; stop aborta runs em andamento.
- `kanban.js`: rotas `/api/runtimes`, `/api/runs*` (guards: token, origem, Host, content-type,
  body ≤ 16 KB); `renderCanvasPage(title, { control })` injeta o token e liga os controles.

## Módulos e arquivos afetados

- `src/run.js`, `src/runtimes.js`, `src/serve.js`, `src/kanban.js`, `src/lib/runner.js`
- `src/lib/runs-api.js` — novo
- `tests/runs-api.test.js` — novo; `README.md`, `AGENTS.md`

## Ordem de tasks

1. `115` — API local de execuções (rotas, guards, descoberta). depende de: —
2. `116` — canvas interativo (Rodar/Parar, timeline ao vivo). depende de: 115
3. `117` — docs. depende de: 116

## Riscos

- Run disparado pelo serve morre se o serve cair → o `reapOrphans` existente marca como órfão.
- Token no HTML do canvas: só legível na mesma origem (sem CORS) e com Host validado.
