# harness — Status

## Fase 1 — Fundação do harness
- [x] CLI `scripts/harness` (init, module, task, start, finish, requeue, reopen, sync, log, history, report, kanban, check, update)
- [x] Banco SQLite `.harness/harness.db` (tasks, task_events, interactions; regenerável via `harness sync`)
- [x] Agents prontos (`.opencode/agent/`) + referências modulares (`.agents/*.md`)
- [x] Pipeline queue → active → done com escopos disjuntos (paralelismo seguro)

## Fase 2 — Workspaces (múltiplos projetos)
- [x] `harness workspace init` (registro `.harness-workspace.json` + cache do AGENTS.md)
- [x] `harness workspace new` (projeto novo no workspace) e `add` (projeto existente com onboarding)
- [x] `harness workspace list|status` (queue/active/done, versão, onboarded)
- [x] `harness workspace check|sync|report|update [--all]` com validação de isolamento
- [x] `harness workspace run <projeto> <cmd>` + flag global `--project <projeto>`
- [x] Kanban agregado multi-projeto com detalhamento (modal: escopo, arquivo, timeline, interações)
- [x] Testes de workspace + kanban (`tests/workspace.test.js`, `tests/kanban.test.js`)
- [x] Correções da revisão (P1–P4): docs de paths relativos, erro de `--project` tratado, status.md real, `handleDetail` com prefixo ambíguo → 400

## Fase 3 — Limpeza de dogfood
- [x] Histórico: tasks/módulos de exemplo removidos do repo-fonte (v0.2)
- [x] v0.3: o template do perfil `web` voltou a gerar os módulos padrão (tenancy, auth,
  authorization, audit) e as tasks de fundação — agora isolados no perfil, não na base
- [x] `context/project/overview.md` e `stack.md` neutros por perfil

## Fase 4 — Evolução (lote B1+B2+B3+C1+A1)
- [x] B1 — `harness workspace task <projeto> "<desc>"` cria task direto no projeto
- [x] B2 — `harness workspace report --all --format json` agrega métricas num JSON único
- [x] B3 — `harness check` na raiz do workspace valida isolamento automaticamente
- [x] C1 — ADR-004 (copy-per-project) e ADR-005 (workspaces)
- [x] A1 — WIP limits no kanban (`.harness/kanban.json`, move bloqueado com 400, badges no header)
- [x] `computeMetrics` sincroniza do markdown (fonte da verdade)

## Fase 5 — Ergonomia (init --workspace, grupo por módulo, version/changelog)
- [x] `harness init --workspace <dir>` delega para `workspace init`
- [x] Kanban: toggle "agrupar por módulo" nas colunas
- [x] `harness version [--bump patch|minor|major]` (incrementa + registra interação)
- [x] `harness changelog [--out CHANGELOG.md]` (gera a partir dos handoffs)
- [x] Testes verdes (contagem crescendo com as fases)

## Fase 6 — Estabilidade dos testes (flake de IPC do node --test)
- [x] `helpers.withSilentStdout` silencia banners do produto nos testes ruidosos
- [x] 3 testes ruidosos de `kanban.test.js` envolvidos (kanbanFor estático, prefixo ambíguo, WIP bloqueia)
- [x] Testes verdes (contagem crescendo com as fases) estáveis (3 execuções consecutivas)

## Handoff (lote 3 — task 15: flake de IPC do kanban.test.js)
- Feito: helper `withSilentStdout` em `tests/helpers.js` + 3 testes ruidosos de
  `kanban.test.js` envolvidos. Suíte 69/69 estável em 3 execuções consecutivas;
  `harness check` ok. Nenhuma mudança no produto (`kanban.js`) nem no script de testes.
- Pendências: nenhuma.
- Decisões: no-op cego de `process.stdout.write` engoliria o reporte do runner do
  `node --test` (que trafega no stdout do subprocesso como Buffers v8-serializados,
  nodejs/node#56802) e os testes "sumiriam" do resultado — por isso o helper engole
  apenas strings (banners do produto) e repassa Buffers (protocolo do runner).

## Histórico de handoffs
### Lote 2 — tasks 10, 11 e 12
- Feito: limpeza de dogfood (tasks/módulos de exemplo do template removidos; identidade do
  repo-fonte em overview/stack) e evolução (B1 `workspace task`, B2 `report --all --format json`,
  B3 `check` na raiz do workspace, C1 ADRs 004/005, A1 WIP limits no kanban) + correções da
  revisão (openDb morto removido, computeMetrics fecha o banco, handoff renovado).
- Pendências: nenhuma. Testes 67/67, `harness check` ok.
- Decisões: computeMetrics sincroniza do markdown (fonte da verdade); WIP via
  `.harness/kanban.json` avaliado por projeto dono do card; `check` na raiz do workspace
  valida isolamento sem afetar o check de projeto.

## Fase 7 — v0.3 (workspace multi-perfil)
- [x] Perfis (web/api/cli/script/game/docs/design/bare), `init --profile`, `harness profile`
- [x] Spec-driven (`harness feature`, `--feature`, ACs) e DoR/prioridade/tipo
- [x] Worktree por task, gates (nativos + scripts), conventional commits
- [x] Memória local (session/recall/status/memory prune) — sem claude-mem
- [x] Adaptadores OpenCode/Claude/Codex + skills/commands compartilhados

## Fase 8 — Hardening (review v0.3.2)
- [x] P0: escopo por HEAD + pré-merge, segredos, kanban seguro, lock com ownership,
  execução sem shell, workspace new/add
- [x] P1: gates strict, `check --db`, `workspace --json`, traversal/prune, SQLite busy,
  parser único de flags, copyDir binário, datas locais

## Fase 9 — Kanban Next.js
- [x] Dashboard multi-projeto em `workspace/kanban` (read-only)
- [x] v2: ações via server actions chamando o CLI (start/finish/requeue/reopen/worktree)

## Handoff (v0.3.3)
- Feito: suite em 136 testes; `harness check`/`gates` verdes; release v0.3.3.
- Pendências: Sprint 2 docs (71–76) e revisão contínua.

## Handoff (task 82 — rotinas: núcleo do schema, agendador e disparo)
- Feito: `scripts/harness/src/routines.js` (novo) — `loadRoutines` valida `.harness/routines.json`
  (AC-1: rotina inválida sai em `errors` com mensagem clara e NÃO entra em `routines`;
  arquivo ausente é estado válido — serve não morre), parser `parseEvery`
  (`<n>m`, `<n>h`, `daily@HH:MM`, `weekly@<seg..dom>@HH:MM`), `nextRun` no fuso local
  (daily/weekly cruzando meia-noite cobertos), `fireRoutine(id)` criando task na queue pela
  lógica extraída de `task.js`, dedupe por título normalizado considerando queue/active
  (done não bloqueia) e eventos do disparo no banco (`routine_fired` / `routine_skipped` /
  `routine_error` + interação `source: routines`, task_id `routine:<id>` quando não há task
  associada — AC-6). `task.js`: criação extraída para `createTaskFile` (export) e `slugify`
  (export); `task(args)` e `harness workspace task` preservam o comportamento legado
  (regressão coberta por spawn do CLI real). `startScheduler()` exportado como stub
  (o loop em si é task 86). Suíte: 156/156 (`node --test`), `harness check` ok.
- Pendências: loop do agendador, `harness serve` (kanban + ticker + webhook) e painel de
  rotinas chegam nas próximas tasks da feature `rotinas` — consumam `loadRoutines`,
  `nextRun`, `fireRoutine` e `startScheduler` de `src/routines.js`.
- Decisões: criação de task vira função única (`createTaskFile`) — CLI e rotinas compartilham
  defaults (agent backend, priority P2, type feat) e normalização de título; dedupe compara o
  SLUG do título (mesma normalização do nome de arquivo `NN-<slug>.md`); erros de disparo não
  se propagam (resultado `{ ok, error }`), e schema de `routines.json` ignora campos
  desconhecidos mas valida tipos de `id/every/dedupe/task.title/priority/type/scope`.

## Handoff (task 83 — adapter browser: MCP Playwright por tool)
- Feito: `harness adapter browser <tool>` (AC-1..AC-5) — camada `browser` em `TOOLS`+
  `TOOL_INFO` (`list` mostra browser) e subcomando no `adapterCmd` (sem `<tool>` → ajuda de
  uso, exit 0; flag `--browser-package`, default `@playwright/mcp@latest`). Injeção via
  `upsertJsonSection` (lib/adapters.js): arquivo ausente → JSON canônico (opencode.json
  ganha `$schema`), parse estrito ok → insere `mcp.browser`/`mcpServers.browser` preservando
  o resto, server "browser" já presente → no-op idempotente (exit 0), JSONC/comentário,
  raiz não-objeto ou seção não-objeto → fail-safe: NADA é escrito e o erro carrega o bloco
  de merge manual (bin imprime em stderr → exit 1). codex → `adapters/browser/.codex/prompts/
  browser.md` copiado (config.toml comentado; Codex não tem .mcp.json). `init --tools
  opencode,claude,browser` instala a config no scaffold (loop passa `tools` p/ o
  `installAdapter`); `.agents/browser.md` (NOVA) entra por init/update via `.agents`
  inteiro (AC-6). Suíte: 174/174, `harness check` ok (AC-8: zero deps — nada toca
  package.json/lockfile, coberto por teste).
- Pendências: índice de `.agents/` no `AGENTS.md` não lista `browser.md` (fora do escopo;
  task seguinte da feature/docs pode incluir a linha na tabela de referências). Nada mais.
- Decisões: engine de injeção morou em `lib/adapters.js` (escopo fixo — novo arquivo não
  seria permitido); `lib/templates.js` não precisou de mudança (copyDir+render já cobre o
  elemento codex); targets de MCP são `opencode|claude|codex` (`MCP_TARGETS`) e a camada
  browser em si não é tool-alvo; fail-safe prefere falhar a sobrescrever config do usuário.

## Handoff (task 84 — canvas: coleção de estado de execução + endpoint)
- Feito: `lib/canvas.js` (NOVO) — `canvasState(ctx)` produz `{ generated_at, canvas[] }` com
  um cartão por task ativa: agente/título via `taskFromMarkdown`/`boardQuery` (sem re-parse),
  worktree + branch do registro `.harness/worktrees.json` (`readRegistry`) ou `'raiz'` +
  branch da raiz (AC-2), `started_at` + `running_ms` pré-computado, contagem de arquivos
  via `git status --porcelain` com timeout defensivo 2000ms → `'n/d'` em não-repo/timeout,
  último `task_event` e última interação `note` (já redigida no storage) — AC-3,
  `last_activity_at` = max(started, evento, nota) e `staleness` booleano calculado no
  servidor com `STALE_MS` = 15min (AC-4). Degradação graciosa: db indisponível (corrompida)
  → só markdown + git (histórico `null`); worktree registrada mas ausente no disco → raiz.
  Nenhuma UI: `kanban.js` recebeu APENAS a rota `GET /api/canvas` (bind 127.0.0.1 inalterado,
  mesma diretriz do `/api/board`) — a vista/cartões são a task 85. Suíte 181/181.
- Pendências: task 85 (vista Execução /cartão, badge de staleness, modal, auto-refresh 3s)
  consome `GET /api/canvas` — payload já vem pré-computado para a UI não recomputar (AC-6).
- Decisões: `canvasState` itera `ctx.projects` (mesmo formato multi-projeto do `buildBoard`,
  cartões marcados com `project`); disco vence registro — worktree listada e ausente degrada
  para raiz; `changed_files: 'n/d'` é string por convenção da task e os demais campos
  desconhecidos ficam `null` (a UI formata); sem atividade alguma → `stale: false` (sem
  dados, sem julgamento); `STALE_MS` exportado para os testes usarem o limiar real.

## Handoff (task 85 — canvas: vista "Execução" com cartões ao vivo)
- Feito: `kanban.js` — novo export `renderCanvasPage(title)` (página server-side da vista
  `/canvas`: grid de cartões, um por task ativa, com tema/CSS idêntico ao board; cartão
  exibe id/título, agente, worktree/branch ou "raiz", tempo de execução (`fmtDur`),
  arquivos alterados (`'n/d'` quando indisponível), último evento + relativo, última nota
  com prefixo "o agente reporta:", badge + fundo amarelo quando `stale`; estado vazio
  "Nada em execução agora"; auto-refresh `setInterval(loadCanvas, 3000)` — AC-1/2/3/4).
  Rota nova `GET /canvas` (mesma instância do `serveBoard`, página pré-renderizada);
  `serveBoard` injeta o link "▶ vista Execução" no header do board via string-replace
  (navegação board ⇄ Execução). Clique no cartão abre o modal de histórico reutilizando o
  endpoint `GET /api/tasks/:id/detail` (AC-5); v1 read-only — nenhum endpoint de write novo.
  Testes: +4 em `tests/kanban.test.js` (página+dados, navegação vice-versa, moves em tempo
  real via pipeline do board, read-only POST → 404). Suíte 185/185; `harness check` ok.
- Pendências: estético/evolutivo — vista Execução no kanban estático (`--out`), marcações
  do canvas em `--host` multi-interface, animação do poll. Nada bloqueante.
- Decisões: a página do canvas vive em `kanban.js` (template externo não seria permitido
  fora do escopo) — o template `board.html` ficou INTACTO e o link no board é injetado no
  modo serve por replace de `<span class="spacer"></span>` (degradação silenciosa se o
  markup mudar); modal reusa os endpoints existentes em vez de duplicar dados no payload
  do `/api/canvas`; badge de staleness calculado no servidor (84) e apenas refletido na UI;
  stale-first na ordenação dos cartões para chamar atenção sem js de filtro extra.
