# AGENTS.md — Workspace do AlterAI - Agentic OS

Este diretório é a raiz de um **workspace**: agrupa N projetos independentes, cada um com
árvore/monorepo própria, git próprio, `context/` próprio e cópia própria do harness.
Este arquivo **não é o protocolo de um projeto** — para trabalhar em código, entre no
projeto alvo (cwd) e siga o AGENTS.md dele.

Workspace: `{{NAME}}` · projetos em: `{{PROJECTS_DIR}}/`

## Descobrir os projetos

- `pnpm harness workspace list` (ou `status`) — tabela com queue/active/done, versão do harness e onboarded.
- O registro vive em `.harness-workspace.json` (paths absolutos).

## Comandos de workspace

| Comando | O que faz |
|---|---|
| `pnpm harness workspace new <nome>` | Cria um projeto novo no workspace |
| `pnpm harness workspace add <path>` | Registra projeto existente (onboarding se não tiver a camada) |
| `pnpm harness workspace check --all` | Valida o registro/isolamento + check de cada projeto |
| `pnpm harness workspace sync --all` | Reindexa o banco de cada projeto |
| `pnpm harness workspace update --all` | Atualiza a camada do workspace e de todos os projetos |
| `pnpm harness workspace report --all` | Métricas de cada projeto |
| `pnpm harness workspace run <projeto> <cmd...>` | Roda um comando harness dentro do projeto |
| `pnpm harness <cmd> ... --project <projeto>` | Roda um comando harness no projeto, de qualquer lugar |
| `pnpm harness workspace kanban [--serve]` | Kanban agregado com detalhamento das tasks |

## Isolamento entre projetos — regras para agentes

1. **Trabalhe dentro do projeto alvo** (cwd do projeto). O protocolo obrigatório é o do
   AGENTS.md do projeto (context/project/*, módulos, pipeline queue→active→done).
2. **Leia apenas o `context/` do projeto em que você está.** Nunca leia nem altere
   `context/` de outro projeto.
3. **Cruzar projetos exige comando explícito** (`--project <projeto>` ou
   `workspace run <projeto> <cmd...>`). Não há atalho implícito entre projetos.
4. **Tasks, escopos e validações** (`harness start`/`finish`/`check`) são **por projeto**.
   Um card no kanban agregado pertence ao projeto dono — mover só afeta ele.
5. **Guard rails do harness valem em todos os projetos:** consentimento prévio,
   escopo estrito, nunca `git checkout`/`restore`/`reset` sem aprovação, sem tarefas "bônus",
   reportar qualquer dúvida sobre o estado do repositório antes de agir.

## Registrar interações

- `pnpm harness log "<resumo>" --kind note --source agent` na raiz do workspace para
  registrar handoffs entre lotes.