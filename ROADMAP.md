# Roadmap — AlterAI - Agentic OS

Caminho do pipeline atual até a visão "Agent Harness Canvas", com o núcleo headless primeiro
([ADR-006](context/project/adr/ADR-006-nucleo-headless.md)). Detalhes técnicos em
[ARCHITECTURE.md](ARCHITECTURE.md).

Cada item vira uma task em `context/agents/queue/` com `## Escopo` e critérios verificáveis.

## Fase 1 — Fundação de execução (em planejamento)

| Task | Entrega | Depende de |
|---|---|---|
| 20 | Barramento de eventos normalizado (`events` no SQLite, `harness events`) | — |
| 21 | Worktree por task (`start --worktree`, `merge`, `worktree list/clean`) | 20 |
| 22 | Contrato de runtime adapter + registro + `harness runtimes` (detecção real) | 20 |
| 23 | Adaptador Claude Code + `harness run <task> --runtime claude-code` | 21, 22 |
| 24 | `harness context <task>` — pacote de contexto com estimativa de tokens | 20 |

**Pronto quando:** uma task pode ser executada por um agente real dentro da sua própria
worktree, com todos os eventos e o uso de tokens gravados, e integrada por `harness merge`
depois do `check`.

## Fase 2 — Multi-runtime e orquestração

- Adaptadores Codex CLI, Gemini CLI, OpenCode e genérico (CLI qualquer com stdout).
- `harness run --parallel`: lote de tasks, uma worktree e um runtime por task.
- Estados finos da task (PLANNING, BLOCKED, WAITING_APPROVAL, REVIEW, TESTING, FAILED…) como
  campo `phase`, mantendo queue/active/done como estado macro.
- Interrupção (`harness stop <task>`) que mata processos filhos.
- Retomada de sessão quando o runtime suportar (`sessionResume`).

## Fase 3 — Memória e contexto

- Memória em níveis: global, workspace, agente, sessão, task, conhecimento (ADRs).
- Busca full-text (FTS5 do SQLite) antes de busca semântica.
- Separar fato verificado, suposição, observação temporária e informação obsoleta.
- Context packager usando memória + orçamento de tokens por runtime/modelo.

## Fase 4 — Qualidade, políticas e custos

- Quality gates declarados na task (`## Gates`: test, lint, typecheck, build) e bloqueio do
  `merge` quando falham — nunca marcar teste não executado como aprovado.
- Hooks de ciclo de vida (antes/depois de task, de ferramenta, de alteração de arquivo).
- Policy engine (ler, escrever, rede, deploy, apagar banco) com aprovação explícita.
- Orçamento por projeto/agente/task e relatório de custo (medido vs. estimado).

## Fase 5 — API local e app desktop

- `harness serve`: API HTTP local + stream de eventos (SSE) sobre o núcleo — evolução do
  servidor do kanban.
- App desktop (pacote próprio, Tauri + React): Command Center, Agent Canvas (React Flow),
  Workspace IDE (Monaco + xterm), Activity Center.
- Design system "Harness UI" (dark-first).

## Fase 6 — Extensibilidade e ambiente

- MCP Hub (servidores locais/remotos, permissões por agente, auditoria).
- Skills, Commands e Plugins com manifesto, versão e permissões declaradas.
- Sandbox por containers (limites de CPU/memória/rede) como backend de execução.
- Navegador integrado para preview local e validação visual.
- Benchmark Lab e avaliação de agentes.
