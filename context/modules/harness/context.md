# harness — Contexto do Módulo

## Responsabilidade
Camada de operação do AlterAI - Agentic OS: protocolo obrigatório, contexto vivo e pipeline
de tarefas (queue → active → done). Inclui o CLI `scripts/harness` (zero deps, Node ≥ 22.5),
os agents prontos (`.opencode/agent/`), as referências modulares (`.agents/*.md`) e, desde a
v0.1.0, a camada de **workspaces** para operar N projetos independentes com isolamento.

## Entidades
- **Workspace** — diretório raiz com `.harness-workspace.json` (registro: `version`, `harnessSource`, `projectsDir`, `projects[]`)
- **Projeto** — monorepo independente (git, `context/` e camada harness próprios), registrado no workspace
- **Task** — arquivo em `context/agents/{queue,active,done}/<nn>-descricao.md` com `## Escopo` declarado

## Use Cases (CLI)
- `harness workspace init|new|add|list|status|check|sync|report|update|run|kanban`
- `harness <cmd> --project <projeto>` — roteia o comando para o projeto do workspace
- `harness start|finish|requeue|reopen|task|log|history|report|kanban|check|sync|update|module`

## Eventos que Publica
- `task.started`, `task.finished`, `task.requeued`, `task.reopened`, `task.synced`, `check_violation`
- (registrados em `.harness/harness.db` — `task_events`, `interactions`)

## Eventos que Consome
- (n/a — o harness é a camada de operação, não consome eventos de domínio)

## Dependências
- Node ≥ 22.5 (`node:sqlite`), pnpm (só para o script `pnpm harness`)

## Repositórios / Fontes da verdade
- Markdown das tasks (`context/agents/`) — fonte da verdade
- `.harness/harness.db` — índice/histórico (regenerável via `harness sync`)
- `.harness-workspace.json` — registro de projetos do workspace (paths absolutos)

## Regras de isolamento (workspaces)
- Comandos rodam no cwd; cruzar projetos exige `--project`/`workspace run` explícito
- `harness workspace check` valida: duplicados, árvores aninhadas, raiz do workspace, paths inexistentes