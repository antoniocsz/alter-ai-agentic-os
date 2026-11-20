# harness — Status

## Fase 10 — Sandbox por tool (task 87)
- [x] `SANDBOX_PROFILES` (minimal default, strict superset) com deny por prefixo em `lib/adapters.js`
- [x] Perfil aplicado na instalação dos adapters claude/opencode/codex + `--sandbox` no `adapterCmd` + painel no `list`
- [x] `.agents/sandbox.md` (matriz de garantias harness × tool + política: mudar deny ⇒ ADR) entregue por init/update

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

## Handoff (task 87 — sandbox por tool: perfis de permissão declarados)
- Feito: `SANDBOX_PROFILES` + `matchesSandboxDeny` + emissores por tool em `lib/adapters.js`
  (`resolveSandbox`, `opencodeDenyLines`, `claudePermissions`/`writeClaudeSettings`,
  `codexSandboxSection`, `SANDBOX_ALLOW`, `SANDBOX_SUPPORT`). Deny MAIOR por prefixo de
  comando — minimal: `git reset*`, `git checkout*`, `git restore*`, `git clean*`,
  `git push*`, `rm -rf*`, `sudo *`; strict (superset): + `pnpm install*`, `npm install*`,
  `expo install*`, `curl *`, `wget *`; allow explícito `pnpm harness*`/`node
  scripts/harness*` em todos os perfis (AC-6: pipeline nunca casa nos denies e o
  negativo está em teste). Templates consomem o perfil: claude →
  `adapters/claude/.claude/settings.json` regenerado do perfil (allow/deny; template
  == saída minimal, adicionado `git clean` que faltava); opencode → NOVOS templates
  em `adapters/opencode/.opencode/agent/` (5 agents, espelhos byte-faithful dos ao
  vivo + `{{SANDBOX_DENY}}`; reviewer preserva `edit: deny`, executores recebem
  `permission.bash` por glob); codex → seção `{{SANDBOX_SECTION}}` honesta no
  `.codex/README.md` (admitindo que a tool não reforça deny). `adapterCmd` ganha
  `--sandbox strict|minimal` (default minimal, inválido falha) e `adapter list`
  mostra o perfil + onde ele aterrissa por tool (AC-7). `.agents/sandbox.md` (NOVA)
  com matriz de garantias, tabela de comandos e política de evolução (mudar deny ⇒
  ADR); entra em projetos por `init` (copia `.agents` inteiro) e `update` — nenhum
  toque em init.js/update.js. Suíte 194/194 (181 baseline + 13 novos), `harness
  check` ok, zero regressão no adapter claude (settings JSON válido + CLAUDE.md/
  agents/skills intactos), nada em package.json/lockfile, AGENTS.md não tocado
  (índice de `.agents/` fica para a task 89).
- Pendências: `harness update` não sincroniza `adapters/` — projetos antigos que
  rodarem `harness adapter opencode` após update caem no fallback
  (`.opencode/agent`, agents sem `permission:`) até o `adapters/opencode` chegar
  ao projeto (mesmo débito já existe para claude/codex/browser; sugerir
  HARNESS_LAYER += 'adapters' numa task de pipeline/debt — forasteiro do escopo
  desta task). README/matriz de capacidades continua na task 89.
- Decisões: fonte dos agents da tool layer passou a ser
  `adapters/opencode/.opencode/agent/` (convenção espelhada da task 83:
  `adapters/browser/.codex/...`), com fallback silencioso para `.opencode/agent`
  do kit — os agents ao vivo do kit NÃO foram alterados (fora do escopo; a sessão
  continua usando `.opencode/agent`); teste guard-rail de drift compara corpo
  (sem bloco `permission:`) template vs ao vivo. `settings.json` do claude é
  sobrescrito pelo perfil na instalação e o template estático permanece igual à
  saída minimal (init copia stash de `adapters/` sem render; install re-renderiza).

## Handoff (task 92 — header compacto parseado: Tipo/Prioridade/Módulo)
- Feito: `parseTask` (`lib/tasks.js`) entende o header compacto
  `## Agente: \`backend\` | Módulo: \`harness\` | Prioridade: P3 | Tipo: docs` via
  `splitCompactHeader` (export): o primeiro segmento continua como valor do heading
  (`values['Agente']` = `` `backend` ``) e cada `Campo: valor` seguinte vira
  `values[Campo]` sem crases envolventes. Heading dedicado (`## Tipo: fix`) tem
  precedência em qualquer posição do arquivo; valor com ` | ` que não segue o formato
  `Campo: valor` fica intacto. Não retroativo: tasks em done/ não foram reescritas.
  Testes: +5 em `tests/pipeline-cross.test.js` (extração, sem Tipo, precedência
  antes/depois, crases/valor intacto, e fim-a-fim `worktree finish` → squash
  `docs(task-07)`).
- Pendências: nenhuma.
- Decisões: campos extras só entram em `values` depois do loop (precedência do
  dedicado sem depender da ordem); split exige ` | ` com espaços e TODOS os segmentos
  seguintes no formato `Campo: valor` (fail-safe contra falso positivo).

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

## Handoff (task 90 — correções de validação do pipeline: parser de escopo + merges intercalados)
- Feito: dois bugs restritivos do mundo real dos lotes 1–2 (handoffs 82–84) corrigidos.
  (1) `parseTask` (`tasks.js`): bullets de escopo agora tomam como path o PRIMEIRO bloco
  entre crases (`- \`path\` (NOVO)` → `path`; anotações antes/depois ignoradas;
  `- \`a\` e \`b\`` fica `a`) com fallback legado intacto (sem crases ou crase solta:
  strip de pontas) — compatibilidade com tasks antigas varrida pela suíte e pelo
  `harness check` da raiz (tasks reais parseiam igual). (2) Validação de escopo tolera
  merges intercalados de worktrees paralelas: no `finishTask` (`pipeline.js`) o
  out-of-scope do range `startHead..HEAD` ignora arquivos cujo ÚLTIMO commit que os
  tocou é o squash de OUTRA task — novo export `commitTaskId` (extrai id de
  `feat(task-<n>)`/`fix!(task-<n>)`/`feat(task-<n>)!: ...`, qualquer conventional type)
  + `filesAttributedToOtherTasks` (um `git log --name-only --no-renames` no range,
  atribuição pelo primeiro bloco que contém o arquivo, pois o log sai mais novo
  primeiro). No `finishWorktree` (`worktree.js`) a checagem passou a rodar APÓS o
  rebase: `base..HEAD` pós-rebase é exatamente o delta que o squash merge aplica — o
  drift de merges intercalados de outras worktrees deixa de contaminar o diff
  pré-rebase (era o "fora do escopo na worktree" falso da task 86). Bloqueio real
  preservado (teste negativo): arquivo fora do escopo declarado (sujo) e arquivo de
  outra task tocado na raiz (sujo) continuam reprovando com as mesmas mensagens —
  `fora do escopo declarado` / `fora do escopo na worktree`. O mecanismo
  `## Baseline (git)` segue valendo por cima (nada removido). Suíte 204/204
  (198 baseline + 6 novos em `tests/pipeline-cross.test.js`): parseTask anotado/legado,
  unit `commitTaskId`, unit de atribuição (último toque decide, fail-closed), finish
  com 2 squash intercalados (`fix(task-03)` também), dirty fora do escopo bloqueado e
  worktree end-to-end (2 worktrees do mesmo base, A mergeia, B fecha sem Baseline e
  sem reprovar arquivos da A). `harness check` ok (worktree e raiz com o código novo).
  Zero deps: nada toca package.json/lockfile.
- Pendências: merges manuais do usuário com subject fora do padrão `type(scope):`
  continuam precisando de `## Baseline (git)` (documentado no teste, comportamento
  mantido). A task 86 roda em paralelo: se ela terminar após este merge, o finish
  dela pela raiz (código atualizado) já coleta a atribuição "feat(task-90)" por si;
  se terminar antes, seu range está limpo — nenhum deadlock.
- Decisões: (1) atribuição por commit foi a alternativa escolhida (prescrita como
  opção primária na task) — a alternativa "head por task no evento worktree_started/db"
  não cobria o lado da worktree (o diff `base..HEAD` pré-rebase continua contaminado
  pelo drift) e persistiria estado de git no banco; (2) no lado da worktree, a
  correção moveu a checagem para pós-rebase em vez de criar range de merge-base —
  simples e hole-free: sob lock, `base..HEAD` pós-rebase é só o delta próprio e
  valida exatamente o payload do squash (o conteúdo do bloqueio é o mesmo, só a
  posição dele na sequência muda); (3) arquivos sujos (working tree da raiz) não
  são atribuíveis a outras tasks — o estado sujo é o delta da task em validação
  (rematado por teste negativo); (4) fail-closed em toda a atribuição: git
  erro/range vazio/ou ownId ausente → nada é liberado de graça.

## Fase 11 — Rotinas servidas: `harness serve` (task 86)
- [x] `harness serve [--port n] [--host h]` — kanban + agendador das rotinas + webhook num único processo zero-deps
- [x] Scheduler real (`startScheduler`, routines.js): tick recarrega routines.json, dispara `fireRoutine` no horário, erro de schema reportado sem derrubar nada
- [x] Webhook `POST /webhook/routines/:id?token=` — 401 sem/errado token (auditado), 404 inexistente, 200 `{criada}`/`{skip:dedupe}`; token em `.harness/webhook-token` persistido e comparado em tempo constante
- [x] `GET /api/routines` — `{id,title,every,nextRun,lastRun,fireCount}` com estado em memória + backfill do banco (payload do painel da 88)

## Fase 12 — Marcador de adapters e sync no `update` (task 91)
- [x] `.harness/adapters.json` (gitignored) gravado pelo `adapter <tool>` — `{ tools, sandbox, browser }`, merge idempotente
- [x] `harness update`: pós-cópia da camada re-instala cada tool do marcador com `installAdapter` (kit da fonte + sandbox salvo)
- [x] Sem marcador → comportamento anterior; fonte sem `adapters/` ou marcador ilegível → aviso claro e skip (não erro)

## Fase 13 — Consolidação de docs do ciclo (task 89)
- [x] README: 5 seções novas (Execução ao vivo /canvas · Rotinas e `harness serve` · Adaptador browser · Sandbox por tool · Update sincroniza adapters) + índice e matriz de capacidades por tool atualizados
- [x] `.agents/browser.md` e `.agents/sandbox.md` no índice de referências modulares (AGENTS.md + README) — débito das tasks 83/87
- [x] CHANGELOG regenerado via `harness changelog` (handoffs do ciclo, entradas 82–91 presentes)
- [x] Release 0.4.0 (`harness version --bump minor`)

## Handoff (task 91 — `update` ressincroniza os adapters instalados)
- Feito: (1) Marcador `.harness/adapters.json` (gitignored junto dos demais artefatos do
  `.harness/`) gravado pelo `adapter <tool>` pós-instalação (`recordAdapterInstall` em
  `lib/adapters.js`, chamado por `adapter.js`) com `{ "tools": [...], "sandbox": "minimal|strict|null",
  "browser": { target, package }? }` — merge idempotente (tool nova entra; re-run não duplica nem
  reordenou), nunca substitui entradas de outros adapters; `sandbox` só é atualizado quando a flag
  `--sandbox` foi usada explicitamente (re-install sem flag nunca derruba o perfil salvo);
  `adapter browser <tool>` grava tool-alvo + pacote para o replay. Corruption → marcador é
  reconstruído com aviso (`recovered`). (2) `harness update`: `HARNESS_LAYER += 'adapters'`
  (fecha o débito do handoff 87 — o projeto passa a receber os templates frescos) e pós-cópia
  re-executa `installAdapter` para cada tool do marcador (`syncInstalledAdapters`), com
  `kit` = fonte (`opts.kit` novo em `installAdapter`, default `harnessRoot()`), perfil do
  `resolveConfig` do projeto e sandbox do marcador (null → default minimal) — idempotente.
  Sem marcador → nada de sync (comportamento anterior); fonte sem `adapters/` ou marcador
  ilegível/inválido → `⚠️ aviso:` e skip (não erro); erro por-tool (`fail-safe` do browser,
  p.ex.) vira warning e não derruba o update. Mensagens: linha
  `adapters ressincronizados: ...` + interação no banco com o resumo. (3) README/docs NÃO
  tocados (task 89); nada de CSV/JSON de reports tocado; `kanban.js` intocado (task 88 paralela).
- Testes: `tests/update-adapters.test.js` (NOVO, 11) — marcador gravado/preservado/merge
  idempotente via CLI `adapterCmd`, browser com detalhes, `readAdaptersMarker` normalizando
  (`issues` para shape/JSON/sandbox/tools desconhecidas), update sem marcador (no-op),
  replay com templates da fonte v1→v2 (NAME/PROFILE/SANDBOX_DENY renderizados), sandbox
  salvo respeitado no replay (claude strict), fonte sem `adapters/` → aviso + preservação,
  marcador corrompido → aviso + skip, dry-run não ressincroniza. Suíte completa 228/228
  (217 baseline + 11), `harness check` ok, zero deps (nada toca package.json/lockfile).
- Pendências: docs do update (marcador/behavior) sobem na task 89. Marcador não é escrito
  pelo `init --tools` (fora do escopo — projetos initados instalando adapters não ressincronizam
  via marcador até rodarem `adapter <tool>` uma vez); decidir se `init` também grava o marcador
  numa task futura da feature.
- Decisões: (1) helpers do marcador moram em `lib/adapters.js` (fonte única entre CLI e
  update; `adapter.js` grava no fluxo do comando como pedia a task) e a leitura/validação é
  tolerante — problemas viram `issues` que o consumidor imprime, o update nunca trava por
  arquivo recriável; (2) sync usa `kit` = fonte em vez de copiar e depois instalar do projeto —
  elimina dependência de ordem e garante templates frescos mesmo com a cópia da camada;
  (3) `adapters` entrou no `HARNESS_LAYER` (o débito sugerido no handoff 87) — sem isso o
  `adapter <tool>` do projeto pós-update continuaria instando templates antigos; o `found`/
  `synced` do update passam a incluí-los automaticamente; (4) mensagens de aviso padronizadas
  `⚠️ aviso: <detalhe>` — coerentes com o estilo de erro/aviso do produto.

## Handoff (task 86 — `harness serve`: scheduler real + webhook com token)
- Feito: `src/serve.js` (NOVO) — comando `harness serve [--port n] [--host h]` (AC-5):
  um processo onde `serveBoard` segue presidindo board/`/api/board`/`/api/canvas`/
  `/canvas`/detail/move e, via `extras.routines`, ganha o webhook e o payload das rotinas.
  Token: `readOrCreateWebhookToken` (`crypto.randomUUID` na 1ª execução, reusado depois;
  arquivo vazio regenera), comparação `tokensMatch` em tempo constante (sha256+
  timingSafeEqual). `createRoutinesApi`: fire (webhook/agenda) atualiza estado em memória
  `{lastRun, fireCount}`; hydrate semeia ids AUSENTES do banco (servir de novo não perde o
  histórico); snapshot = payload do painel 88. `buildServe` = wiring injetável
  (root/port/host/tickMs/clock) para testes; `stop()` gracioso — scheduler.stop +
  closeIdleConnections + close (força em 3s) + `releaseOwnLock` (lock do pipeline com pid
  deste processo é removido; lock alheio intocado). CLI: bind 127.0.0.1 default; WARNING
  quando `--host` fica fora do loopback; banner NUNCA imprime o token (só onde ele mora);
  SIGINT/SIGTERM → stop + exit(0). `routines.js`: stub `startScheduler` → loop real — tick
  recarrega routines.json, planeja `nextRun` por rotina, dispara `onDue` (default
  `fireRoutine`) e CONSOME o horário mesmo em falha (sem martelada de `routine_error`);
  erros de schema reportados com dedupe por mudança de conjunto (AC-1: servem sem morrer);
  contrato legado sem-args preservado (descritor "não rodando") para o pin de testes da 82.
  `recordRoutineEvent` exportado (reuso). `kanban.js`: `ctxFromRoot` extraído de
  `ctxFromCwd` + rotas novas — POST `/webhook/routines/:id` (401 sem/errado token auditado
  como `webhook_rejected`; válido → `webhook_received` + fireRoutine: 200 `{criada}` |
  `{skip:'dedupe'}` | 404 quando "rotina não encontrada" | 500 em falha de criação; body
  drenado e ignorado na v1) e GET `/api/routines`
  ([{id,title,every,nextRun,lastRun,fireCount}]) — modo kanban puro (sem extras) NÃO expõe
  as rotas (404, regressão em teste). `commands/index.js`: `serve` no mapa + linha no
  usage. Testes: `tests/serve.test.js` (NOVO, 13) — tokensMatch, token
  persistido/reusado/regenerado, happy path (200 criada + task com defaults do CLI +
  eventos `webhook_received`/`routine_fired` + interação system), 401 ×2 (nada disparado +
  `webhook_rejected`), 404 fantasma (`routine_error`) e id fora do padrão sem tocar o
  banco, dedupe via HTTP (200 skip + fireCount 2), payload do painel, hidratação do
  restart, scheduler com relógio injetável (dispara na janela e re-planeja), AC-1 no serve,
  kanban preservado + rotas 404 no modo puro, shutdown gracioso (porta efêmera, lock do
  próprio pid solto, alheio intacto, server fechado de verdade), CLI (warning de exposição,
  porta inválida mostra uso, banner sem segredo). Suíte: 211/211 (198 baseline + 13
  novos), `harness check` ok.
- Pendências: painel de rotinas do board (AC-7) é a task 88 — consumir `GET /api/routines`
  e o caminho do webhook ("rodar agora") confirmado por token local. Sem catch-up: se o
  serve estava fora do ar no horário, o disparo é perdido (janelas futuras seguem normais;
  webhook cobre a execução sob demanda). Sem rate-limit no webhook (v1 token-only; `--host`
  fora do loopback imprime WARNING de exposição).
- Decisões: scheduler mora no `routines.js` (a API de disparo/agenda do módulo), com o
  contrato legado sem-args mantido; tick default 30s com `clock`/`tickMs`/`onDue`
  injetáveis — o teste da 82 continua pinnando o descritor sem-args em vez do loop, e o
  loop real é aplicado no serve. `fireCount` = disparos VÁLIDOS (criada OU skip dedupe);
  hydrate do banco semeia apenas ids ausentes (memória é o valor ao vivo — nunca soma as
  duas fontes). kanban.js não importa routines.js — a rota consome só `{snapshot, fire,
  checkToken, record}` injetado por `extras.routines` (nenhum acoplamento novo). Token
  comparado por digest sha256 + timingSafeEqual (tempo constante independente do tamanho).
  Porta default 4310 — mesma do kanban, pois `serve` é o superset e a URL fica estável
  para quem migra; `--port 0` dá porta efêmera (uso dos testes). Token NUNCA é impresso
  no log/stdout (rastreável em `.harness/webhook-token`, gitignored junto do banco).

## Handoff (task 88 — painel de rotinas no board: lista, "rodar agora", degradação)
- Feito: `kanban.js` — (1) painel "⏱ Rotinas" no board do modo serve, injetado por
  string-replace junto ao link da vista Execução (85): drawer lateral `#routines-panel`
  com a mesma estética/tokens da vista canvas (classes `rp-*` para não colidir com os
  handlers de drag&drop do board), lista de `GET /api/routines` (id, título, `every`,
  próxima execução absoluta+relativa, última execução, disparos válidos), refresh
  manual, auto-refresh 30s só com o painel aberto e toast no elemento `#toast` do board
  (verde ok / vermelho erro, mesmo visual dos moves). (2) Botão "rodar agora" → rota
  NOVA `POST /api/routines/:id/run` que reusa o MESMO núcleo de disparo do webhook
  (`respondRoutineFire`, extraído de `handleWebhook`): `checkToken` com o token LIDO DO
  ARQUIVO local (`.harness/webhook-token` — o serve é o dono do processo; sem acoplamento
  novo e o segredo JAMAIS chega à página, coberto por teste), record do recebimento com
  mensagem "pelo painel", e fire/dedupe/resposta (`{criada|skip}`/404/401/500)
  idênticos ao webhook; guard `sameOrigin` como nos moves (a rota autentica pelo
  arquivo local, então a origem é o que impede uso de fora). (3) Degradações: sem
  `.harness/routines.json` o painel não é injetado (nem o toggle); routines.json
  presente sem `extras.routines` (kanban puro) → painel abre em modo inativo com badge
  "⚠ inativo — rode harness serve" e `/api/routines`|`/run` seguem 404. routines.json
  é SEMPRE manual (nenhum endpoint de edição). Testes: +8 em `tests/kanban.test.js`
  (painel on/off, kanban puro, run criada + auditoria + payload, dedupe, fantasma/
  BIG-UPPER sem tocar o banco, CSRF 403, token-local-ausente 401, estático sem painel).
  Suíte 225/225 (217 baseline + 8), `harness check` ok e smoke E2E ao vivo no browser:
  criada→dedupe→fireCount/board atualizando ao vivo, zero erros de console e JSON
  inválido (BOM) não derrubou o serve.
- Pendências: nenhuma na feature rotinas (AC-7 fechado). Evolutivo: o painel decide a
  presença no BOOT do serve (routines.json criado com o serve no ar exige restart para
  o toggle surgir) — mesmo padrão do link da Execução (85).
- Decisões: (1) "rodar agora" é rota própria mas reusa o núcleo do webhook
  (`respondRoutineFire`) — dedupe, auditoria e códigos HTTP exatamente iguais, sem HTTP
  self-call; `POST /webhook/routines/:id` segue 1:1 (os 13 testes da 86 intactos).
  (2) kanban.js continua SEM importar routines.js (decisão da 86): presença do painel é
  `fs.existsSync(.harness/routines.json)` (a fonte declarativa, lida diretamente) e o
  funcional vem da injeção de extras. (3) Constante nomeada `WEBHOOK_TOKEN_FILE` (como
  no serve.js): `WEBHOOK_TOKEN = 'webhook-token'` casava no padrão de segredos do gate
  (`X_TOKEN = valor`) e reprovava 2 testes do gate na suíte — renomear mantém o valor
  e o nome honestos (o nome aponta o ARQUIVO). (4) Toast com cor por kind no elemento
  existente do board (sucesso verde) — feedback igual aos moves, com sinal positivo.
  (5) Sem framework: HTML server-side + JS inline (`var`/function, padrão do
  board/canvas).

## Handoff (task 89 — docs de consolidação do ciclo)
- Feito: README consolidou o ciclo nas 5 seções pedidas — "Execução ao vivo (canvas)"
  (rota `/canvas` do `kanban --serve`: tabela de campos do cartão, staleness de 15min,
  modal reusando `/api/tasks/:id/detail`, auto-refresh 3s via `/api/canvas` pré-computado,
  read-only, sem a vista no kanban estático — pendência declarada); "Rotinas e
  `harness serve`" (um processo: kanban + agendador + webhook; bind 127.0.0.1 com WARNING
  fora do loopback; porta 4310 — migração de `kanban --serve` mantém a URL; tick 30s
  recarregando routines.json; sem catch-up documentado; painel decide presença no boot;
  schema de `.harness/routines.json` com `id/every/dedupe` e
  `task{title,module,agent,priority,type,scope}`; tabela de respostas do webhook
  200 criada|dedupe / 401 / 404; token em `.harness/webhook-token`, reusado e nunca
  impresso em log; curl testável lendo o token do arquivo; `GET /api/routines` com
  `fireCount` reconstruído do banco; `POST /api/routines/<id>/run` = mesmo núcleo do
  webhook); "Adaptador browser" (uso de `harness adapter browser <tool>` +
  `--browser-package`, matriz por tool espelhando `.agents/browser.md`, idempotência
  no-op, fail-safe JSONC, zero-install via npx); "Sandbox por tool" (perfis minimal/strict,
  allow do pipeline, matriz de garantias com limite honesto por tool espelhando
  `.agents/sandbox.md`, ADR para mudança de deny); "Update sincroniza adapters"
  (marcador `.harness/adapters.json` escrito por `adapter <tool>`, replay no update com
  sandbox salvo e templates da fonte, sem marcador/sem fonte → aviso, `init --tools` não
  grava o marcador). Índice do README, matriz de capacidades (linhas MCP e
  Permissões/sandbox atualizadas), `harness serve` na tabela de comandos do CLI,
  `adapters/` com browser na árvore e na lista de camadas do update, e linha duplicada
  do fluxo de orquestração removida. AGENTS.md: `browser.md` e `sandbox.md` entraram na
  tabela "Índice de referências modulares" (débito das tasks 83/87). CHANGELOG
  regenerado via `harness changelog` — 71 handoffs, entradas 82–91 confirmadas.
  `harness version --bump minor`: 0.3.4 → 0.4.0.
- Pendências: (1) kanban estático (`--out`) sem vista Execução; (2) webhook sem
  rate-limit (v1 token-only; `--host` fora do loopback imprime WARNING); (3) sem
  catch-up de horário perdido (serve fora do ar no horário = disparo da janela perdido,
  webhooks cobrem sob demanda); (4) `init --tools` não grava o marcador
  `.harness/adapters.json` — projeto initado só entra no sync do update depois de rodar
  `adapter <tool>` uma vez (decidir init-grava-marcador numa task futura); (5) painel
  decide presença no boot (routines.json criado com o serve no ar exige restart). Nada
  bloqueante.
- Decisões: documentação HONESTA verificada bloco a bloco contra o código (serve.js,
  routines.js, kanban.js, lib/adapters.js, adapter.js, update.js) e contra os handoffs
  82–91 — nenhuma rota/comando/resposta citada sem existir; exemplos com o CLI real
  (`node scripts/harness/bin/harness.js serve`, curl com token lido do arquivo); as
  matrizes de browser/sandbox são espelhos de `.agents/browser.md` / `.agents/sandbox.md`
  (fonte da verdade), não paraphrase; README passou a refletir `adapters` como camada
  copiada pelo update (`HARNESS_LAYER` da 91) nas "Regras de ouro" e no parágrafo do
  update; docs only — nenhuma mudança de código além do bump em
  `scripts/harness/package.json`.
- Revisado: suíte 236/236 verde; `harness check` ok; integridade UTF-8 do status.md
  conferida pós-gravação (zero U+FFFD — lição do incidente da task 88).
