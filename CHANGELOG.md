# Changelog

## 2026-11-03 — 38-workspace-check-bin.md

- workspace check --all resolve o CLI do projeto (projeto -> raiz legado -> harnessSource); teste cobre workspace sem scripts na raiz; 110 testes verdes.

## 2026-11-03 — 37-gates-artefatos.md

- runGates limpa pnpm-lock.yaml criado como efeito colateral (preserva lockfile real); 109 testes verdes.

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
