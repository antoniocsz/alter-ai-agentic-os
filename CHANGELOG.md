# Changelog

## 2026-11-10 — 88-backend-rotinas-ui.md

- Painel Rotinas no board (AC-7): drawer com GET /api/routines + botao rodar agora via nova rota POST /api/routines/:id/run que reusa o nucleo do webhook (respondRoutineFire) com o token lido do arquivo local no servidor (sem segredo na pagina, sameOrigin como os moves); degradacao: sem routines.json o painel nao injeta, kanban puro mostra badge 'inativo - rode harness serve'; +8 testes (suíte 225/225), check ok, smoke E2E no browser (criada, dedupe, 0 erros de console).

## 2026-11-10 — 91-backend-update-sincroniza-adapters.md

- update sincroniza adapters: marcador .harness/adapters.json gravado pelo adapter <tool> (merge idempotente; sandbox salvo so com --sandbox explicita), HARNESS_LAYER += adapters e pos-copia re-instala cada tool do marcador com installAdapter (kit=fonte, sandbox do marcador); sem marcador e no-op; fonte sem adapters/ ou marcador ilegivel e aviso e skip (nao erro); suite 228/228 (+11 testes novos em tests/update-adapters.test.js), harness check ok

## 2026-11-10 — 86-backend-serve-webhook.md

- harness serve (AC-4/5/6): 1 processo com kanban+scheduler real das rotinas+webhook com token (.harness/webhook-token, tempo constante); rotas /api/routines (payload do painel 88) e POST /webhook/routines/:id (401/404/200 criada|skip); startScheduler real em routines.js; stop gracioso com releaseOwnLock; suíte 211/211 (198+13 novos em tests/serve.test.js), check ok

## 2026-11-10 — 90-backend-correcoes-pipeline-validacao.md

- fix: parser de escopo aceita anotacao apos o path (primeiro bloco entre crases, fallback legado); validacao de escopo resolve merges intercalados de worktrees (atribuicao por commit no finishTask + check pos-rebase no finishWorktree); Baseline continua valendo e bloqueio real coberto por teste negativo; suite 204/204 e check ok

## 2026-11-10 — 87-backend-sandbox-por-tool.md

- sandbox por tool: SANDBOX_PROFILES minimal/strict (deny por prefixo, allow explicito do pipeline), templates claude/opencode/codex consomem o perfil via --sandbox (default minimal), .agents/sandbox.md com matriz e politica ADR, adapter list mostra o perfil; suite 194/194, check ok

## 2026-11-10 — 85-backend-canvas-ui.md

- vista Execução /canvas: renderCanvasPage server-side (grid ao vivo, staleness amarelo, modal do board, auto-refresh 3s, read-only) + rota GET /canvas + link board-canvas vice-versa; 185/185 tests, check ok

## 2026-11-10 — 84-backend-canvas-dados.md

- canvas dados: lib/canvas.js (novo) com canvasState(ctx) - um cartao por task ativa com agente, worktree/branch (ou raiz; degrada p/ raiz se registrada e ausente no disco), started_at + running_ms pre-computados, contagem git status --porcelain com timeout 2s (n/d em nao-repo/timeout), ultimo task_event e ultima interacao note (redigida), last_activity_at e staleness booleana (STALE_MS 15min, calculada no servidor; sem atividade nenhuma = false). kanban.js recebeu APENAS a rota GET /api/canvas (bind 127.0.0.1 inalterado; vista/cartoes sao a task 85). Degradacao graciosa: db corrompida/indisponivel -> so markdown + git, historico null; worktree fantasma -> raiz. Testes: tests/canvas.test.js 7 novos (degradacoes, staleness, nota redigida, rota vazia/plena) - suite 181/181; check ok. Pendencia: task 85 consome GET /api/canvas (payload ja pre-computado, auto-refresh 3s da vista fica na 85). decisoes: token fake de teste concatenado no padrao do redact.test.js p/ nao acionar o gate secrets; baseline da task 84 anotado com os 9 arquivos intercalados das tasks 82/83 (ha tempo de finish: startHead anterior aos merges 1937ffd/47645cc). - DONE

## 2026-11-10 — 83-backend-browser-adapter.md

- camada browser: adapter browser injeta MCP Playwright (@playwright/mcp@latest via npx, zero deps) em opencode.json/.mcp.json, injecao idempotente com fail-safe de merge manual (upsertJsonSection); codex recebe .codex/prompts/browser.md; init --tools aceita browser; .agents/browser.md entregue por init/update; suite 174/174, check ok; baseline da task atualizado p/ cobrir arquivos mergeados da task 82 na janela (rotinas) - falso-positivo de escopo intercalado

## 2026-11-10 — 82-backend-rotinas-core.md

- Task 82 concluida: schema de routines.json validado com mensagem clara (AC-1); parser every e nextRun no fuso local (AC-2); fireRoutine com dedupe por titulo e eventos de disparo no banco (AC-3 e AC-6); criacao de task extraida para createTaskFile em task.js com CLI legado preservado; startScheduler como stub p/ task 86; suite 156/156 e harness check ok.

## 2026-11-04 — 81-dor-multidep.md

- DoR valida dependências separadas por vírgula individualmente; teste com 2 deps e dep ausente.

## 2026-11-04 — 80-gitignore-next.md

- Template ignora .next/ (build Next); descoberto no shell do meu-editor.

## 2026-11-04 — 79-gitignore-tsbuildinfo.md

- Template ignora *.tsbuildinfo; descoberto no install do meu-editor.

## 2026-11-03 — 78-normalizar-tasks.md

- Tasks compactas do Sprint 1/2 normalizadas com ## Modulo; harness check voltou a verde.

## 2026-11-03 — 77-release-v034.md

- Release v0.3.4: Sprint 2 (docs consistentes, agentes alinhados, status/changelog, qualidade interna).

## 2026-11-03 — 76-code-quality.md

- Testes limpam %TEMP% no exit; parseTask ignora BOM; linha duplicada de version removida; 137 testes verdes.

## 2026-11-03 — 75-docs-changelog-status.md

- status.md atualizado: historico de dogfood corrigido, fases 7-9 (v0.3/hardening/kanban Next), contagem de testes e pendencias atuais.

## 2026-11-03 — 74-docs-workspace.md

- context/workspace/adr criado; referencia corrigida para <projeto>/context; mapa e kanban v2 ja atualizados.

## 2026-11-03 — 73-docs-agents-openCode.md

- frontend aponta ui-ux.md; executor/coordinator usam worktree finish; ## Agente padronizado sem prefixo agente-; orchestration/feature-planning alinhados.

## 2026-11-03 — 72-docs-agents-templates.md

- Stack base neutra; READMEs usam harness global; docs gates reais; paths context/agents removidos; template workspace sincronizado (remove/task/run).

## 2026-11-03 — 71-docs-readme.md

- README: versao 0.3.3, indice sem links concatenados (+ worktree/perfis/workspaces/metricas), arvore com features/sessions/adapters/core, flags de task/finish, --bare removido, 7 blocos por perfil.

## 2026-11-03 — 65-parser-flags.md

- Parser unico de flags (--k v/--k=v/boolean) aplicado em task/log/history/finish/worktree; descricao e handoff nao confundem mais com valores de flag; testes do parser; 136 testes verdes.

## 2026-11-03 — 70-release-v033.md

- Release v0.3.3: P0 (escopo/worktree, seguranca, kanban, lock, workspace), P1 (strict, check db, json, traversal, prune, binario, datas, sqlite) e kanban Next v2.

## 2026-11-03 — 64-sqlite-robustez.md

- SQLite com busy_timeout=5000; DBs fechados em check/memory; reduz SQLITE_BUSY em concorrencia CLI/kanban.

## 2026-11-03 — 67-datas-locais.md

- Datas locais (GMT-3) em sessoes, retrospectiva e feature (entregue junto da 66).

## 2026-11-03 — 66-copydir-binario.md

- copyDir binario-safe + datas locais (localDate/localMonth) em sessoes/retro/feature; testes de bytes e formato.

## 2026-11-03 — 69-kanban-v2-actions.md

- Kanban v2: server actions chamam o CLI no servidor para start/finish/requeue/reopen/worktree, com validacao de projeto/task/movimento e feedback por banner; build Next ok.

## 2026-11-03 — 68-adapter-layer.md

- adapters copiados no init/onboarding/cache (entregue nas tasks 62-63); erro claro quando a fonte nao existe.

## 2026-11-03 — 63-tasks-worktree-hardening.md

- resolveTaskName rejeita traversal/separadores; registry write atomico; prune remove worktree e branch orfa; testes de regressao.

## 2026-11-03 — 62-workspace-json-adapter.md

- workspace --json, adapters na camada, gitignore; include hardening de task id e registry atomico (task 63).

## 2026-11-03 — 61-check-db-days.md

- check --db compara markdown x banco; report --days validado (entregue junto da task 60).

## 2026-11-03 — 60-gates-strict.md

- gates.strict + check sem efeito colateral (nao cria DB; --db compara markdown x banco) + report --days validado; 129 testes verdes.

## 2026-11-03 — 59-kanban-nextjs.md

- Kanban Next.js v1 em workspace/kanban: discovery do workspace subindo diretorios, leitura server-side dos markdown/registry, board multi-projeto com prioridade/modulo/feature/worktree/escopo, GET /api/board, build Next 15 ok; read-only (acoes na v2).

## 2026-11-03 — 58-p0-workspace-config.md

- workspace new/add usam layerSource (cache -> harnessSource -> kit), new aceita --profile/--bare; cache em .harness/workspace; status/recall usam workspaceContext (paths absolutos e agregacao fora de projeto); config duplicada removida; testes de cache/profile/contexto.

## 2026-11-03 — 57-p0-lock-heartbeat.md

- Lock com token de ownership (release so do dono), stale 30min e gate timeout 10min (HARNESS_GATE_TIMEOUT_MS); evita roubo durante gates longos; testes de ownership.

## 2026-11-03 — 56-p0-kanban-seguro.md

- Kanban seguro: bind 127.0.0.1 (--host explicito), ids validados (sem traversal/%), handler com try-catch (nao derruba com %), CSRF por Origin, content-type JSON, body limit 64KB; testes de ataque; 124 testes verdes.

## 2026-11-03 — 55-p0-segredos.md

- Segredos: env em MAIUSCULAS (DB_PASSWORD, AWS_SECRET_ACCESS_KEY, DATABASE_URL), Bearer e .env* detectados/redigidos; allowlist de defaults locais; sem skip de tests/ ou nomes com lock; 123 testes verdes.

## 2026-11-03 — 54-p0-git-injecao.md

- init/gates sem shell cru: execFileSync com args, branch e nome de gate validados (injeção bloqueada); quotePath ja corrigido na 53; testes de branch maliciosa e gate invalido; 123 testes verdes.

## 2026-11-03 — 53-p0-escopo-integridade.md

- Escopo agora considera HEAD do start (git diff) + working tree; worktree valida escopo antes do rebase/merge (commit nao esconde arquivo fora); git status/diff com core.quotePath=false -z (acentos preservados); 121 testes verdes.

## 2026-11-03 — 52-release-v032.md

- Release v0.3.2: itens verdes (ADR lifecycle, glossario, ciclo de vida de projeto, profile set/current, matriz de tools, retrospectiva).

## 2026-11-03 — 51-tool-matrix-retro.md

- Matriz de capacidades por tool no README; harness retro gera retrospectiva (metricas+sessoes) em context/project/retro com --force; teste novo; 118 testes verdes.

## 2026-11-03 — 50-ciclo-vida-projeto.md

- workspace remove (unregister; --delete --force com bloqueio fora da raiz) e profile set/current; testes de workspace e profile; 118 testes verdes.

## 2026-11-03 — 49-adr-glossario.md

- ADR template com ciclo de vida e indice adr/README.md; glossary.md no template base; AGENTS aponta glossario/runbook/ADR.

## 2026-11-03 — 48-release-v031.md

- Release v0.3.1: hardening medio (ACs, retencao de memoria, commits convencionais, runbook, LFS game, observabilidade) + alias global.

## 2026-11-03 — 47-observabilidade.md

- report inclui gate_failed e worktree_finished em table/json/csv; teste novo; 115 testes verdes.

## 2026-11-03 — 46-rastreabilidade-ac.md

- task --acs + ## ACs; check valida cada AC na spec da feature; feature-planning, usage e README atualizados; 114 testes verdes.

## 2026-11-03 — 45-memory-prune.md

- memory prune (dry-run/apply) arquiva sessoes antigas em context/sessions/archive/AAAA-MM e remove do indice; recall continua achando; 114 testes verdes.

## 2026-11-03 — 44-doc-runbook-base.md

- README base cita context/project/runbook.md.

## 2026-11-03 — 43-runbook-assets.md

- Template base inclui context/project/runbook.md; perfil game documenta assets e LFS com .gitattributes; README atualizado.

## 2026-11-03 — 42-conventional-commits.md

- Conventional Commits: task --type valida tipos e grava ## Tipo; squash merge usa type(task-N): subject; builder em lib/commits.js; teste de worktree valida a mensagem.

## 2026-11-03 — 41-alias-harness.md

- Wrappers harness/harness.cmd em bin/; PATH do usuario e ~/.bashrc apontando para D:/projetos/harness/bin; comando harness global validado; README documentado.

## 2026-11-03 — 40-doc-workspace-layout.md

- README documenta projectsDir . e harnessSource ../harness (kit fora da raiz do workspace).

## 2026-11-03 — 39-release-v03.md

- Release v0.3.0: bump minor e CHANGELOG gerado dos 19 handoffs do pipeline.

## 2026-11-03 — 38-workspace-check-bin.md

- workspace check --all resolve o CLI do projeto (projeto -> raiz legado -> harnessSource); teste cobre workspace sem scripts na raiz; 113 testes verdes.

## 2026-11-03 — 37-gates-artefatos.md

- runGates limpa pnpm-lock.yaml criado como efeito colateral (preserva lockfile real); 112 testes verdes.

## 2026-11-03 — 36-prefixo-numerico.md

- resolveTaskName aceita prefixo numerico curto (1 => 01); corrige sugestao do proprio CLI; teste novo.

## 2026-11-03 — 35-kanban-worktree.md

- Kanban mostra badge da worktree ativa (branch) lendo o registry do projeto; teste novo; 107 testes verdes.

## 2026-11-03 — 34-dor-prioridade.md

- DoR no start (escopo, aceite, spec, dependencia) + prioridade P0..P3 ordenada no status; check valida prioridade; escopos de tasks concluidas nao liberam mais arquivos (furo corrigido); CI roda harness gates --phase merge; 106 testes verdes.

## 2026-11-03 — 33-segredos-redaction.md

- Redaction automatica (sk-, JWT, password=) em sessoes/interacoes/recall; gate secrets varre repo (com allowlist e skip de testes); perfis incluem secrets no finish; 102 testes verdes.

## 2026-11-03 — 32-lockfile.md

- Lockfile .harness/lock com timeout, stale-auto-clear e reentrancia; start/finish/requeue/reopen/worktree sob lock (merge serializado); check detecta lock orfao; 98 testes verdes.

## 2026-11-03 — 31-adaptadores-tool.md

- Adaptadores multi-tool: core/ neutro; adapters shared (skills+commands); opencode (agent/skill/command); claude (CLAUDE.md @AGENTS.md, agents, skills, settings com deny destrutivo); codex (prompts); harness adapter list|tool e init --tools; 93 testes verdes.

## 2026-11-03 — 30-memoria-local.md

- Memoria local: session end/list (db + context/sessions), recall (db+markdown, agrega no workspace), status (WIP/worktrees/sessoes/handoff); tabela sessions; zero dependencia externa; smoke validado; 88 testes verdes.

## 2026-11-03 — 29-motor-gates.md

- Motor de gates: finish roda gates.finish e bloqueia com gate_failed; gates nativos links/test:affected/artifact; comando harness gates; perfis web/api/docs/design atualizados; smoke docs validado; 85 testes verdes.

## 2026-11-03 — 28-worktree-por-task.md

- Worktree por task: start/finish/list/prune com branch task/<n>, rebase, gates.merge (executor minimo), squash merge, finish e limpeza; --keep/--skip-gates; registro em .harness/worktrees.json + eventos; .worktrees/.tmp ignorados; 82 testes verdes.

## 2026-11-03 — 27-init-dry-run.md

- init --dry-run valida e mostra o que seria gerado sem tocar no disco; 80 testes verdes.

## 2026-11-03 — 26-spec-driven.md

- Camada spec-driven: harness feature cria spec+plan com ACs; task --feature grava secao e avisa sem spec; check reprova feature sem spec; feature-planning 5 fases e bootstrap por perfil; 79 testes verdes.

## 2026-11-03 — 25-perfis-projeto.md

- Templates em _base + 8 perfis; init --profile (web default, --bare=bare) e comando profile; prisma restrito a web/api; regra de temporarios no AGENTS.md + .tmp/ ignorado; 77 testes verdes.

## 2026-11-03 — 24-agents-neutro.md

- AGENTS.md neutro (protocolo/guard rails/perfil); regras de stack TS movidas para .agents/stack-ts-monorepo.md; README deixa de duplicar protocolo e aponta fonte unica; 74 testes verdes.

## 2026-11-03 — 23-harness-json.md

- harness.json declarativo (profile, gates, git, wip) com load/validate; template web; check valida quando presente; 74 testes verdes.

## 2026-11-03 — 22-registry-comandos.md

- Dispatcher switch substituído por registro de comandos em src/commands/index.js (usage co-locado); bin/harness.js 60 linhas; 70 testes verdes.

## 2026-11-03 — 21-pipeline-tasks-dir.md

- Pipeline movido para tasks/{queue,active,done} com fallback legado context/agents; templates, init, workspace e docs atualizados; finish agora libera o pipeline root; 70 testes verdes.

## 2026-11-03 — 20-migracao-kit-workspace.md

- Kit migrado para D:/projetos/harness com histórico preservado; README atualizado para o workspace real; 70 testes verdes.
