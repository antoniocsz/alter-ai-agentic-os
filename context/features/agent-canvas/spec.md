# Spec: agent-canvas

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: agent-canvas`.
> Criada em 2026-11-09.

## Problema

Quando o coordenador spawna N subagents em paralelo, o estado de execução é invisível fora do CLI: o board mostra colunas de tasks (queue/active/done), mas não **o que está rodando agora** — em qual worktree, quanta coisa mudou, qual o último relato do agente. A inspiração é o canvas do Superfik: ver os agentes trabalhando, um cartão ao vivo por execução.

## Comportamento esperado

- O servidor do kanban (`harness kanban --serve`) ganha uma **vista "Execução"** (rota `/canvas`): grid de cartões, **um por task em execução** (coluna active).
- Cada cartão ao vivo exibe:
  - Título + id da task e o **agente** (do `## Agente` da task);
  - **Worktree e branch** da execução (quando registadas em `.harness/harness.db`/git worktree list; fallback: raiz);
  - **Tempo em execução** (desde o evento `started`);
  - **Contagem de arquivos alterados** na worktree (`git status --porcelain`; fallback raiz);
  - **Último evento** registrado (mais recente em `task_events`);
  - **Última nota** do agente (última interação `--kind note`, texto redigido = "o que o agente reporta estar fazendo").
- **Staleness**: sem novo evento/interação a > 15 min → destaque visual (cartão amarelo + badge).
- Clique no cartão abre o modal de detalhamento/histórico existente.
- Auto-refresh a cada 3s (padrão já existente no board) também na vista Execução.
- Dados servidos por endpoint JSON (`/api/canvas`) no mesmo servidor.

## Critérios de aceitação

- [ ] AC-1 — `harness kanban --serve` expõe vista "Execução" (`/canvas`) com um cartão por task ativa (e vazio quando nenhuma em execução).
- [ ] AC-2 — cartão exibe agente, worktree/branch (ou "raiz"), tempo em execução e contagem de arquivos alterados.
- [ ] AC-3 — cartão exibe último `task_event` e última interação `note` ( texto da nota), por task.
- [ ] AC-4 — cartão sem atividade nova a mais de 15 min ganha indicador de staleness.
- [ ] AC-5 — clicar no cartão abre o modal de histórico/detalhamento (reuso do existente).
- [ ] AC-6 — endpoint `GET /api/canvas` retorna o estado (tasks ativas + dados acima) e alimenta a vista com auto-refresh 3s.
- [ ] AC-7 — bind continua 127.0.0.1 por padrão; WIP limits e pipeline de moves continuam funcionando (nenhuma regressão do board).

## Fora de escopo

- Ações de controle no canvas (botões kill/restart/spawn) — v1 é read-only.
- Kanban estático (`--out`) ganhar a vista Execução (fica p/ evolução).
- Sessões/agentes fora do pipeline de tasks (ex.: agentes que não operam `harness start/finish`).
- Multi-projeto: a vista Execução é por projeto (kanban agregado do workspace é outra superfície).
