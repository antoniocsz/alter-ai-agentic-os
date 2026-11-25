# AlterAI - Agentic OS

Camada de operação que padroniza como agentes de IA trabalham em um projeto de software. O AlterAI - Agentic OS define o **protocolo obrigatório**, mantém o **contexto vivo** e gerencia o **pipeline de tarefas** — de forma reutilizável em qualquer projeto, independente do domínio ou da stack.

## Índice

- [Começar agora (clonei este repo)](#começar-agora-clonei-este-repo)
- [Visão geral do fluxo](#visão-geral-do-fluxo)
- [Estrutura do AlterAI - Agentic OS](#estrutura-do-alterai---agentic-os)
- [CLI do AlterAI - Agentic OS](#cli-do-alterai---agentic-os)
- [Começando um projeto](#começando-um-projeto)
- [Usar em múltiplos projetos](#usar-em-múltiplos-projetos)
- [Update sincroniza adapters](#update-sincroniza-adapters)
- [Bootstrap de projeto novo](#bootstrap-de-projeto-novo)
- [Pipeline de tarefas (queue → active → done)](#pipeline-de-tarefas-queue--active--done)
- [Execução em paralelo (subagents)](#execução-em-paralelo-subagents)
- [Execução de agentes (`harness run`)](#execução-de-agentes-harness-run)
- [Pacote de contexto (`harness context`)](#pacote-de-contexto-harness-context)
- [Orçamento (`harness budget`)](#orçamento-harness-budget)
- [Adaptadores de tool](#adaptadores-de-tool)
- [Adaptador browser](#adaptador-browser)
- [Sandbox por tool](#sandbox-por-tool)
- [Agentes (subagents opencode)](#agentes-subagents-opencode)
- [Memória local (sessões, recall, status)](#memória-local-sessões-recall-status)
- [Memória em níveis (`harness memory`)](#memória-em-níveis-harness-memory)
- [Painel kanban](#painel-kanban)
- [Qualidade pós-run e analytics](#qualidade-pós-run-e-analytics)
- [Execução ao vivo (canvas)](#execução-ao-vivo-canvas)
- [API local e canvas interativo](#api-local-e-canvas-interativo)
- [Orquestração encadeada (`harness flow`)](#orquestração-encadeada-harness-flow)
- [Execução competitiva (`harness compete`)](#execução-competitiva-harness-compete)
- [Rotinas e `harness serve`](#rotinas-e-harness-serve)
- [Worktree por task](#worktree-por-task)
- [Perfis e `harness.json`](#perfis-e-harnessjson)
- [Workspaces (múltiplos projetos, operação unificada)](#workspaces-múltiplos-projetos-operação-unificada)
- [Métricas e observabilidade](#métricas-e-observabilidade)
- [Protocolo de execução de tarefa](#protocolo-de-execução-de-tarefa)
- [Planejamento de features](#planejamento-de-features)
- [Exemplo de prompt](#exemplo-de-prompt)
- [Geração de código](#geração-de-código)
- [Guard rails — execução somente com consentimento](#guard-rails--execução-somente-com-consentimento)
- [Checklist de conclusão de tarefa](#checklist-de-conclusão-de-tarefa)
- [Índice de referências modulares](#índice-de-referências-modulares)

## Começar agora (clonei este repo)

**Pré-requisitos:** Node ≥ 22.5 e [pnpm](https://pnpm.io).

Este repositório é a **fonte do AlterAI - Agentic OS** (a "camada harness"). Você o usa de duas formas:

**1. Gerar um projeto novo** — cria um monorepo com a camada harness embutida:

```bash
pnpm harness init meu-projeto --profile web [--prisma] [--git]
cd meu-projeto && pnpm install
```

**2. Injetar num projeto existente** — sincroniza a camada (AGENTS.md, `.agents/`, `.opencode/`, `scripts/harness/`) dentro de outro projeto:

```bash
cd /caminho/do/meu-projeto
node /caminho/deste/repo/scripts/harness/bin/harness.js update --source /caminho/deste/repo
```

A partir daí o projeto tem `pnpm harness start|finish|check|...`.

### Comando global `harness`

O kit instala wrappers em `harness/bin/` (`harness` para bash, `harness.cmd` para Windows) e o
`harness/bin` já está no PATH do usuário e no `~/.bashrc`. Em um terminal novo:

```bash
harness version          # 0.4.0
harness status           # de qualquer projeto
harness workspace list   # da raiz do workspace
```

Se o PATH ainda não estiver ativo na sessão atual: `export PATH="/d/projetos/harness/bin:$PATH"`.

**Comandos essenciais:**

| Comando | O que faz |
|---|---|
| `pnpm harness init <dir> --profile <p>` | Gera projeto novo com o perfil escolhido (`web` é o default) |
| `pnpm harness profile` | Lista os perfis (ou detalha um: `harness profile docs`) |
| `pnpm harness init --workspace <dir>` | Gera um **workspace** (equivale a `harness workspace init`) |
| `pnpm harness module <nome>` | Cria um módulo (bounded context) |
| `pnpm harness task "<desc>" --module <m>` | Planeja uma task na queue |
| `pnpm harness start <task>` / `finish <task>` | Executa e finaliza a task (valida escopo) |
| `pnpm harness check` | Valida o estado do pipeline |
| `pnpm harness --version` | Mostra a versão do harness |
| `pnpm test` | Roda os testes do próprio harness (`node:test`, zero deps) |

O CLI também pode ser chamado direto com `node scripts/harness/bin/harness.js <comando>` — útil quando o repo ainda não tem `pnpm install`.

## Visão geral do fluxo

```
Bootstrap (projeto novo)
  └─ context-interview → overview.md, domain-model.md, stack.md, ADRs, queue inicial
        │
        ▼
Planejamento (por feature)
  └─ feature-planning → tasks geradas em tasks/queue/
        │
        ▼
Pipeline de tarefas
  └─ queue → active → done   (N ativas com escopos disjuntos, via harness start/finish)
        │
        ▼
Execução da tarefa
  └─ protocolo de 8 passos + codegen antes de gerar código
        │
        ▼
Conclusão
  └─ status.md atualizado + task em done/ + checklist verificado
```

## Estrutura do AlterAI - Agentic OS

```
AGENTS.md            — arquivo base: protocolo, regras inegociáveis, guard rails, índices
.agents/             — referências modulares (carregar sob demanda por especialidade)
scripts/harness/     — CLI do harness (init, module, start, finish, check)
adapters/            — camada por tool (opencode | claude | codex | browser)
core/                — papéis neutros (coordinator, executor, reviewer)
context/
├── project/         — visão do projeto (overview, stack, glossary, runbook, ADRs)
├── features/        — spec.md + plan.md por feature (spec-driven)
├── sessions/        — memória local (resumo por sessão)
└── modules/         — contexto e status por módulo (context.md + status.md)
tasks/
├── queue/           — tarefas planejadas, não iniciadas
├── active/          — tarefa em execução AGORA (N, com escopos disjuntos)
└── done/            — tarefas concluídas (histórico)
```

## CLI do AlterAI - Agentic OS

`scripts/harness` é um CLI em Node.js (zero dependências), invocado via `pnpm harness` a partir da raiz do projeto (ou direto com `node scripts/harness/bin/harness.js`):

| Comando | O que faz |
|---|---|
| `harness init <dir>` | Gera projeto novo. Flags: `--profile <p>` (web default), `--prisma` (web/api), `--git [--branch <b>]` |
| `harness module <nome>` | Scaffold de módulo. Flags: `--with-prisma`, `--with-http` |
| `harness update [--source <cam>]` | Re-sincroniza a camada harness a partir do harness-fonte (ou `HARNESS_SOURCE`) |
| `harness feature <slug>` | Cria `context/features/<slug>/` com `spec.md` (critérios AC-N) e `plan.md` |
| `harness worktree start <task>` | Cria `.worktrees/task-<n>-<slug>` e branch `task/<n>-<slug>` a partir da base |
| `harness worktree finish <task>` | Commita, rebase, roda gates.merge, squash merge, conclui a task e remove a worktree |
| `harness worktree list` / `prune` | Lista worktrees registradas / limpa entradas órfãs |
| `harness run <task> --tool <claude\|codex\|opencode\|gemini>` | Executa a task no agente, de verdade, dentro da worktree da task. Flags: `--model`, `--unsafe`, `--permission-mode` (só claude); `--stop <run>` interrompe |
| `harness run --batch <t1,t2,...> --tool <t>` | Lote paralelo: prepara as tasks (start + worktree) e roda um agente por worktree ao mesmo tempo. Flag: `--max-parallel` (padrão `wip.active`) |
| `harness runs [<task>]` | Lista execuções de agentes: status, duração, tokens e custo (medido ou n/d). Flags: `--batch <id>`, `--json`, `--limit` |
| `harness budget` | Consumo **medido** (hoje, mês, tasks ativas) contra os limites de `harness.json → budget`; avisa runs sem uso reportado. Flag: `--json` |
| `harness context <task>` | Pacote de contexto da task (regras, feature, módulo, dependências, skills, ADRs, escopo, histórico) com tokens estimados. Flags: `--budget`, `--json`, `--out` |
| `harness events <run>` | Timeline normalizada de uma execução. Flags: `--json`, `--native` (evento original da tool) |
| `harness gates [--phase finish\|merge]` | Roda os gates declarados no `harness.json` |
| `harness status` | Prime de sessão: WIP, ativas, worktrees, últimas sessões e handoff |
| `harness session end "<resumo>"` / `list` | Memória local: grava/lista sessões (db + `context/sessions/`) |
| `harness memory add\|list\|search\|show\|approve\|reject\|update\|outdate` | Memória em níveis (ver "Memória em níveis") |
| `harness recall "<termo>"` | Busca em sessões, tasks, notas e docs (agrega no workspace) |
| `harness adapter <tool>` | Instala (ou lista com `list`) o adaptador de tool no projeto |
| `harness retro [--days n]` | Gera retrospectiva markdown com métricas + sessões do período |
| `harness profile set <p>` / `current` | Troca o perfil do projeto / mostra o atual |
| `harness workspace remove <nome>` | Desregistra o projeto (`--delete --force` apaga a pasta) |
| `harness task "<desc>"` | Cria task na queue. Flags: `--feature`, `--acs`, `--priority`, `--type`, `--module`, `--agent`, `--scope`, `--dep`, `--complexity` |
| `harness start <task>` | Move `queue/` → `active/`, bloqueando conflito de escopo com tasks ativas |
| `harness finish <task>` | Valida `git diff` contra o `## Escopo` e move `active/` → `done/`. Flags: `--handoff`, `--skip-gates` |
| `harness requeue <task>` | Move `active/` → `queue/` (devolve para a fila) |
| `harness reopen <task>` | Move `done/` → `active/` (reabre) |
| `harness sync` | Reindexa o banco SQLite (`.harness/harness.db`) a partir dos `.md` |
| `harness log "<texto>"` | Registra interação no banco. Flags: `--task`, `--kind`, `--source` |
| `harness history <task>` | Mostra eventos + interações de uma task (memorização) |
| `harness report` | Métricas do banco (WIP, cycle time, aging, throughput). Flags: `--format`, `--module`, `--days` |
| `harness kanban` | Painel kanban: `--serve [porta]` (drag&drop) ou `--out <arquivo>` (estático) |
| `harness flow <task> --implement <tool> --review <tool> [--fix t] [--rounds n] [--approve none\|review\|each]` | Orquestração encadeada: implementar → revisar → corrigir (ver "Orquestração encadeada") |
| `harness compete <task> --tools <t1,t2,...> [--judge <tool>]` | Execução competitiva: candidatas em worktrees próprias, juiz opcional, você escolhe (ver "Execução competitiva") |
| `harness context <task> [--stats] [--full]` / `context digest <módulo> --tool <t>` | Pacote de contexto com estatística de economia; digest do histórico do módulo (ver "Otimizador de contexto") |
| `harness analytics [--by tool\|model\|task\|agent\|day] [--since 30d] [--json]` | Tokens, custo, sucesso e gates das execuções (painel `/analytics`) |
| `harness serve [--port n] [--host h] [--allow-unsafe]` | Kanban + agendador de rotinas + webhook + API local de execuções num único processo (ver "Rotinas e `harness serve`" e "API local e canvas interativo") |
| `harness check [flags]` | Valida o protocolo (pipeline, escopos, seções, módulos). Flags: `--json`, `--barrel`, `--lint`, `--typecheck`, `--db` |
| `harness version [--bump patch\|minor\|major]` | Mostra ou incrementa a versão do harness (registra a mudança no banco) |
| `harness changelog [--out <arquivo>]` | Gera `CHANGELOG.md` a partir dos handoffs (`harness finish --handoff`) |
| `harness workspace ...` | Opera sobre múltiplos projetos (ver "Workspaces" abaixo). Subcomandos: `init`, `new`, `add`, `list/status`, `check/sync/report/update [--all]`, `run`, `kanban` |

`<task>` aceita o nome completo (`01-module-tenancy.md`) ou o prefixo numérico (`01`).

## Começando um projeto

1. **Inicializar:** `pnpm harness init <nome-do-projeto> --profile <p> [--tools opencode,claude] [--prisma] [--git]` — gera AGENTS.md, `.agents/`, adaptador(es) de tool, `scripts/harness/`, `harness.json`, `context/` e o esqueleto do perfil. Perfis: `web` (monorepo Fastify+Next), `api` (Fastify+contracts), `cli`, `script`, `game`, `docs`, `design`, `bare`. O perfil `web` já vem com os **módulos padrão** (tenancy, auth, authorization, audit) e tasks de fundação na queue. `--prisma` (web/api) adiciona `docker-compose.yml`, `packages/database` e `.env.example`; `--git` inicializa o repositório com commit inicial.
2. **Versionar:** `cd <nome-do-projeto> && git init && git add -A && git commit -m "chore: bootstrap harness"` (já feito com `--git`).
3. **Instalar:** `pnpm install` (configs e dependências iniciais).
4. **Banco local (com `--prisma`):** `docker compose up -d` e `cp .env.example .env`; scripts em `apps/api`: `db:up`, `db:migrate`, `db:deploy`.
5. **Onboarding:** rodar a context-interview (7 blocos, abaixo; subconjunto conforme o perfil) para preencher `context/project/overview.md` e `stack.md` e definir os ADRs iniciais.
6. **Criar módulos:** `pnpm harness module <nome>` para cada bounded context; preencher `context.md` e `status.md`.
7. **Planejar e executar:** criar tasks em `tasks/queue/` (com `## Escopo`) e operar com `harness start` / `harness finish`.
8. **Verificar:** `pnpm harness check` a qualquer momento — também útil no CI.

## Usar em múltiplos projetos

O AlterAI - Agentic OS segue o modelo **1 fonte + N projetos independentes**: a camada do harness é *copiada* para cada projeto (não compartilhada via import), então cada projeto é dono da própria camada e pode divergir quando quiser.

```
D:\projetos\
├── harness\               ← FONTE (única): o repo onde o harness evolui
│   ├── scripts/harness/   ← o produto (CLI, templates, agents)
│   ├── .agents/ .opencode/ AGENTS.md
│   └── context/           ← dogfood: só serve para desenvolver o harness
│
├── projeto-a/             ← N projetos independentes (git próprios)
├── projeto-b/
└── ...
```

Cada projeto gerado é um monorepo próprio (pnpm/Turbo) que guarda a identidade em `context/project/` (overview, stack, ADRs). A camada do harness fica uniforme entre todos.

**Regras de ouro:**

1. **A fonte não é um projeto.** Mexe-se nela apenas para evoluir o harness e commitar; todo trabalho real acontece dentro de cada projeto.
2. **A identidade do projeto vive em `context/project/`.** É ali que se lê "qual é esse projeto?"; a camada do harness é idêntica em todos.
3. **Customizações de projeto ficam em `context/`, não na camada.** `harness update` sobrescreve `AGENTS.md`/`.agents/`/`.opencode/`/`adapters/`/`scripts/` (com backup do AGENTS.md em `.harness/backups/`).
4. **Para divergir de verdade**, o projeto deixa de rodar `update` e evolui a própria camada — ou você mantém uma fonte por família de projeto (ex: `D:\projetos\harness-web`, `D:\projetos\harness-mobile`).

**Criar um projeto novo (a partir da fonte):**

```bash
node D:/projetos/harness/scripts/harness/bin/harness.js init D:/projetos/projeto-a --profile <p> [--prisma] [--git]
```

**Atualizar a camada (de dentro de cada projeto):**

```bash
pnpm harness update --source D:/projetos/harness            # uma vez, ou
export HARNESS_SOURCE=/d/projetos/harness                  # memorizar a fonte (git bash)
pnpm harness update                                        # daí em diante
```

O `update` traz CLI/agents/AGENTS.md/adapters novos com backup automático, registra
a versão da fonte e re-instala os adapters que o projeto já tiver — ver
[Update sincroniza adapters](#update-sincroniza-adapters).

## Update sincroniza adapters

O `harness update --source <fonte>` copia a camada do harness (`AGENTS.md`, `.agents/`,
`.opencode/`, `adapters/`, `scripts/`) e **re-instala os adapters que o projeto já tem**,
usando o marcador `.harness/adapters.json` (gitignored, junto do banco):

- Cada `harness adapter <tool>` grava a instalação no marcador (`{ "tools": [...], "sandbox":
  "minimal|strict|null", "browser": { "target", "package" }? }`, merge idempotente) — perfil
  de sandbox e, para browser, tool-alvo + pacote são preservados.
- No `update`, cada tool do marcador volta a ser instalada com os templates **frescos da
  fonte** (não da cópia possivelmente antiga do projeto) e o sandbox salvo é respeitado;
  saída inclui a linha `adapters ressincronizados: ...`.
- Sem marcador (projeto que nunca rodou `adapter <tool>`): nenhum sync — comportamento anterior.
- Fonte sem `adapters/` ou marcador ilegível: aviso (`⚠️ aviso:`) e skip — não erro.
- Detalhe honesto: `init --tools` **não** grava o marcador (só `adapter <tool>` grava) —
  rode `harness adapter <tool>` uma vez no projeto para entrar no sync do update.

## Workspaces (múltiplos projetos, operação unificada)

Para operar **N projetos independentes** a partir de um único lugar, crie um **workspace**:
um diretório que agrupa os projetos (cada um continua sendo um monorepo com git, `context/` e
camada harness próprios) e oferece comandos agregados — mantendo **isolamento por padrão** entre
os projetos.

```
D:\projetos\                        ← raiz do workspace
├── AGENTS.md                       ← roteia para os projetos + comandos de workspace
├── .agents/  .opencode/  scripts/  ← camada harness (fonte p/ new e add)
├── package.json                    ← pnpm harness
├── .harness-workspace.json         ← registro (paths relativos à raiz; resolvidos p/ absoluto em memória)
├── harness\                        ← FONTE do kit (repo próprio)
├── projeto-a\                      ← monorepo independente (git + context/ próprios)
└── projeto-b\
```

> Projetos direto na raiz: crie o workspace com `--projects-dir .`. O padrão (`projects/`) também funciona; este workspace usa `workspace/`. O kit pode ficar fora da raiz do workspace via `harnessSource` no registro (ex.: `"harnessSource": "../harness"`).

**Comandos:**

| Comando | O que faz |
|---|---|
| `harness workspace init <dir>` | Cria o workspace (camada harness + registro + cache do AGENTS.md). Flags: `--source`, `--projects-dir`, `--dry-run` |
| `harness workspace new <nome>` | Cria um projeto novo dentro do workspace. Flags: `--profile`, `--prisma`, `--git`, `--branch` |
| `harness workspace add <path>` | Registra projeto existente; se não tiver a camada, faz **onboarding** (backup do AGENTS.md, instala camada + esqueleto `context/`). Flags: `--name`, `--sync`, `--dry-run` |
| `harness workspace remove <nome>` | Desregistra o projeto; `--delete --force` também apaga a pasta (bloqueado fora da raiz) |
| `harness workspace list` / `status` | Tabela: queue/active/done, versão do harness, onboarded |
| `harness workspace check [--all]` | Valida o registro e o **isolamento** (duplicados, árvores aninhadas, raiz, paths inexistentes); `--all` também roda o check de cada projeto |
| `harness workspace sync --all` | Reindexa o banco de cada projeto |
| `harness workspace report --all` | Métricas de cada projeto (`--format json` agrega tudo num JSON único) |
| `harness workspace update [--all]` | Atualiza a camada do workspace; `--all` também atualiza todos os projetos a partir da fonte |
| `harness workspace run <projeto> <cmd...>` | Roda um comando harness dentro do projeto |
| `harness workspace task <projeto> "<desc>"` | Cria uma task direto no projeto (flags do `harness task`) |
| `harness workspace kanban [--serve [porta]]` | Kanban agregado dos projetos, com **detalhamento das tasks** (clique no card: escopo, arquivo, timeline, interações) |
| `harness <cmd> ... --project <projeto>` | Qualquer comando roda no projeto do workspace (resolve o registro subindo de cwd; fallback `HARNESS_WORKSPACE`) |

**Dica:** `harness check` executado **na raiz do workspace** valida o isolamento do registro
automaticamente (equivale ao `workspace check` sem `--all`).

**Isolamento entre projetos (regras de ouro do workspace):**

1. Comandos rodam no cwd; cruzar projetos exige `--project` ou `workspace run` **explícito**.
2. Cada projeto tem git, `context/`, banco e camada harness próprios — nada compartilhado.
3. No kanban agregado, cada card pertence ao projeto dono; mover um card só afeta ele.
4. `harness workspace check` detecta violações de isolamento no registro (duplicado, aninhado,
   raiz do workspace, path inexistente) e falha com exit code ≠ 0.
5. O registro `.harness-workspace.json` guarda paths **relativos à raiz do workspace** (portável);
   `loadRegistry` resolve para absoluto em memória. Projeto fora da árvore do workspace
   (via `add` com path absoluto externo): `--project` exige `HARNESS_WORKSPACE` apontando
   para a raiz, ou rodar a partir da raiz.

**Adicionar projeto existente:** se o projeto já nasceu do `harness init`, `add` só registra.
Se for um projeto real pré-existente (sem a camada), `add` faz o onboarding: backup do
`AGENTS.md` em `.harness/backups/`, instala a camada, cria o esqueleto `context/` e registra —
depois é só rodar a context-interview para preencher `context/project/*`.

## Bootstrap de projeto novo

Via `.agents/context-interview.md` — 7 blocos (subconjunto conforme o perfil), um por vez, confirmando antes de avançar:

| Bloco | Assunto | Gera/impacta |
|---|---|---|
| 1 | Produto e problema | `context/project/overview.md` |
| 2 | Domínio e módulos | `context/project/domain-model.md` |
| 3 | Multi-tenancy e hierarquia | tenancy / authorization |
| 4 | Permissões e papéis | authorization |
| 5 | Apps e superfícies | estrutura de `apps/` |
| 6 | Stack e restrições | `context/project/stack.md` |
| 7 | Prioridades | `tasks/queue/` com tasks iniciais |

Ao final, criar os ADRs iniciais com base nas decisões tomadas.

## Pipeline de tarefas (queue → active → done)

| Pasta | Função |
|---|---|
| `queue/` | Tarefas planejadas, não iniciadas. Criar aqui ANTES de começar. |
| `active/` | Tarefa em execução AGORA. N podem coexistir com escopos disjuntos. |
| `done/` | Tarefas concluídas. Manter histórico. |

O pipeline é operado pelo CLI: `harness start <task>` move `queue/` → `active/` (bloqueando escopo sobreposto); `harness finish <task>` valida o escopo e move `active/` → `done/`.

Regras:

1. Novo trabalho sempre começa registrado em `queue/` (se não existir), depois move para `active/` ao iniciar.
2. Nunca pular a queue — se a tarefa não foi registrada, registrar antes de executar.
3. Ao finalizar, mover de `active/` para `done/` e verificar se há tarefas antigas da queue já concluídas — movê-las para `done/` também.
4. Nome dos arquivos: `<numero>-<descricao-curta>.md` (ex: `23-frontend-goals.md`).
5. Conteúdo da task: título, escopo, referências a módulos afetados e checklist.
6. Toda task declara `## Escopo` com os arquivos que vai tocar — é o que permite paralelismo seguro.
7. Toda task **nova** declara `## Prioridade` (`P0`..`P3`; default `P2`) — `status` ordena a fila por prioridade.
8. **Definition of Ready**: `harness start` só move a task se ela tiver escopo, critério de conclusão,
   spec da feature (quando `## Feature:` existe) e dependências concluídas.

## Worktree por task

O modo recomendado de execução paralela é **1 task = 1 worktree**:

```bash
pnpm harness start 12                          # queue → active
pnpm harness worktree start 12                 # cria .worktrees/task-12-<slug> + branch task/12-<slug>
# subagent trabalha dentro da worktree
pnpm harness worktree finish 12 --handoff "..." # rebase + gates.merge + squash merge + finish
```

- Base: `harness.json → git.baseBranch` (fallback `main`/`master`); o repositório principal precisa estar na base.
- Gate que falha aborta antes do merge e preserva a worktree para inspeção.
- Worktree e branch são removidas ao finalizar; `--keep` mantém, `prune` limpa registro órfão.
- O pipeline usa lock em `.harness/lock`: `start`/`finish`/`worktree finish` são serializados —
  com N agentes, só um merge acontece por vez (rebase → gates → squash). `check` detecta lock órfão.
- **Paridade CI**: o workflow gerado roda `harness check` + `harness gates --phase merge` — o mesmo
  comando do fluxo local, sem definição duplicada de qualidade.
- **Commits**: o squash merge usa Conventional Commits (`feat|fix|docs|refactor|test|chore|perf|build|ci`),
  com escopo `task-<n>`; o tipo vem de `## Tipo` na task (`task --type`).
- `git.model: "trunk"` (default): branches curtas + squash merge; sem `develop` permanente.

## Execução em paralelo (subagents)

Tasks ativas com `## Escopo` disjuntos rodam em paralelo. O `harness start` garante isso: se uma nova task sobrepuser o escopo de uma ativa, o start é bloqueado com a indicação do conflito. Com worktrees, o isolamento é físico: cada subagent trabalha em `.worktrees/task-<n>-<slug>` e o merge passa pelo `worktree finish`.

Fluxo com subagents:

1. Planejar as tasks em `queue/` (via feature-planning), cada uma com `## Escopo` explícito.
2. Para cada task, rodar `harness start <task>` — o CLI valida o paralelismo e move para `active/`.
3. `harness worktree start <task>` por task ativa; spawnar um subagent apontando para a worktree.
4. Cada subagent executa o protocolo obrigatório e termina com `harness worktree finish <task>` — que valida escopo, roda gates e mergeia.
5. Ao final, `harness check` valida o conjunto e o coordenador revisa as tasks em `done/`.

Exemplo de prompt de orquestração:

```
Executar em paralelo as tasks 01-domain-transaction.md e 03-api-routes-transaction.md
da queue. Para cada uma, rode `pnpm harness start <task>` antes de iniciar o
subagent. Cada subagent deve ler o arquivo da task, respeitar o ## Escopo e
concluir com `pnpm harness finish <task>`. Ao final, rode `pnpm harness check`.
```

## Adaptadores de tool

O núcleo do harness (pipeline, gates, memória, CLI) é **neutro de tool** — vive no disco e
qualquer ferramenta que execute shell opera. A camada de instruções é gerada por adaptador:

```bash
harness adapter list
harness adapter opencode     # .opencode/{agent,skill,command}
harness adapter claude       # CLAUDE.md (@AGENTS.md) + .claude/{agents,skills,commands,settings.json}
harness adapter codex        # .codex/prompts (copie para ~/.codex/prompts)
harness adapter browser claude   # server MCP "browser" (Playwright via npx) no .mcp.json
```

- `init --tools opencode,claude,browser` já instala os adaptadores escolhidos (default: `opencode`).
- `AGENTS.md` é canônico; `CLAUDE.md` importa (`@AGENTS.md`); Codex lê `AGENTS.md` nativamente.
- Sandbox: perfis declarados (`minimal` default, `strict`) aplicados na instalação com
  `--sandbox minimal|strict` — ver [Sandbox por tool](#sandbox-por-tool). O CLI continua
  gatekeeper invariante em qualquer tool.
- Browser: MCP do Playwright injetado por tool — ver [Adaptador browser](#adaptador-browser).
- Adapters instalados ressincronizam no `harness update` via marcador
  `.harness/adapters.json` — ver [Update sincroniza adapters](#update-sincroniza-adapters).
- Trocar de tool no meio não perde nada: a sessão seguinte roda `harness status` e retoma.

### Matriz de capacidades por tool

| Capacidade | OpenCode | Claude Code | Codex |
|---|---|---|---|
| Instruções | `AGENTS.md` | `CLAUDE.md` (`@AGENTS.md`) | `AGENTS.md` |
| Subagents | `.opencode/agent/*.md` | `.claude/agents/*.md` | — (sem subagents nativos) |
| Skills | `.opencode/skill/<n>/SKILL.md` | `.claude/skills/<n>/SKILL.md` | — (prompts) |
| Comandos | `.opencode/command/*.md` | `.claude/commands/*.md` | `~/.codex/prompts/*.md` |
| Permissões/sandbox | `permission.bash` por glob nos agents (perfis minimal/strict) | `allow`/`deny` em `.claude/settings.json` (perfis minimal/strict) | instrução no `.codex/README.md` (a tool não reforça deny) |
| MCP | `opencode.json` (`mcp.browser` via adapter) | `.mcp.json` (`mcpServers.browser`) | `~/.codex/config.toml` (instrução em prompts) |
| Memória | CLI `harness` | CLI `harness` | CLI `harness` |

O que se perde no Codex: subagents e skills nativas, e o reforço real de deny (sandbox fica
como instrução vinculante). A orquestração fica sequencial via `AGENTS.md` + CLI. Pipeline,
gates, worktrees e memória são idênticos nas três tools.

## Adaptador browser

Agentes que precisam de navegador (validar UI gerada, screenshots, inspecionar página) usam o
**Playwright MCP** configurado pelo harness — zero dependências: o server resolve via `npx`
na 1ª execução do agente (nada é instalado pelo harness; o pacote baixa no cache do npx).

```bash
harness adapter browser claude                    # .mcp.json da raiz → mcpServers.browser
harness adapter browser opencode                  # opencode.json → mcp.browser
harness adapter browser codex                     # instrução de MCP em .codex/prompts/browser.md
harness adapter browser claude --browser-package <pkg>   # troca o pacote (default @playwright/mcp@latest)
harness adapter browser                           # sem <tool>: ajuda de uso
```

Matriz por tool (fonte: `.agents/browser.md`, entregue por `init`/`update`):

| tool | onde a config vive | limite |
|---|---|---|
| opencode | `opencode.json` → `mcp.browser` | resto do arquivo preservado |
| claude | `.mcp.json` → `mcpServers.browser` | resto do arquivo preservado |
| codex | `.codex/prompts/browser.md` (instrução) | server é manual no `~/.codex/config.toml` |

- **Idempotente**: server "browser" já presente no arquivo-alvo → no-op com mensagem (exit 0).
- **Fail-safe**: arquivo não-JSON-estrito (comentário/JSONC) ou estrutura inesperada → NADA
  é escrito: o bloco a fundir manualmente é impresso e o comando falha (exit ≠ 0).
- `harness adapter list` mostra a camada `browser` entre as disponíveis; `init --tools
  opencode,claude,browser` já entrega a config no scaffold de projeto novo.
- Guard rails de uso: navegação restrita às superfícies da task, screenshots em `.tmp/`
  (gitignored, apagados ao terminar), zero mudança estrutural — detalhes em `.agents/browser.md`.

## Sandbox por tool

A camada de sandbox é um conjunto de **perfis de permissões declarados** entregue aos adapters
(deny **por prefixo de comando**; não é isolamento de SO). O perfil é escolhido na instalação:

```bash
harness adapter claude --sandbox strict    # default: minimal
harness adapter list                       # mostra o perfil aplicado e onde ele aterrissa
```

| Perfil | Bloqueado (deny por prefixo) |
|---|---|
| `minimal` (default) | `git reset*`, `git checkout*`, `git restore*`, `git clean*`, `git push*`, `rm -rf*`, `sudo *` |
| `strict` | idem + `pnpm install*`, `npm install*`, `expo install*`, `curl *`, `wget *` |

Sempre **permitido** (todos os perfis — o pipeline não pode se bloquear): `pnpm harness …` e
`node scripts/harness/…` (allow explícito, coberto por teste).

O que cada tool realmente reforça — matriz honesta (fonte: `.agents/sandbox.md`):

| tool | onde o perfil aterrissa | o que a tool reforça | limite honesto |
|---|---|---|---|
| opencode | `permission.bash` por glob nos agents gerados (reviewer mantém `edit: deny`) | deny por glob no agente | só a execução do agente declarado |
| claude | `allow`/`deny` em `.claude/settings.json` (`Bash(cmd:*)`) | deny de prefixo na sessão | usuário pode reordenar/permitir à mão |
| codex | seção "Sandbox do harness" em `.codex/README.md` | **nada** — sem engine de deny nativa | instrução vinculante ao modelo |
| browser | n/a — camada MCP de navegador | — | — |

- Mudar o deny de um perfil (adicionar/remover prefixo) é mudança estrutural — exige ADR.
- `adapters/` é saída descartável: regenerar com `--sandbox` sobrescreve as permissões do
  projeto (aplicação idêntica via `update`, que re-instala com o perfil salvo no marcador).
- Comandos neutros (`git status`, `node --test`, `pnpm test`…) seguem permitidos nos dois
  perfis; comando bloqueado só sai com consentimento humano (guard rails do AGENTS.md).

## Agentes (subagents opencode)

O harness inclui agents prontos em `.opencode/agent/` (copiados pelo `harness init`):

| Agent | mode | O que faz |
|---|---|---|
| `coordinator` | primary | Orquestra lotes paralelos: `start`, spawna subagents, `check`, revisão e handoff |
| `backend` | subagent | Tasks de API/domínio (carrega `codegen.md` + `backend.md`, opera `start`/`finish`) |
| `frontend` | subagent | Tasks de UI (Next.js + MVVM estrito) |
| `mobile` | subagent | Tasks mobile (Expo + MVVM + offline-first) |
| `reviewer` | subagent | Revisa `done/` (`edit: deny`) usando `.agents/review.md` |

Cada agente segue o protocolo do AGENTS.md, carrega as referências de `.agents/` da sua especialidade e respeita o `## Escopo`. O `coordinator` pode ser acionado por prompt para processar a queue inteira em paralelo.

## Memória local (sessões, recall, status)

A memória é 100% local — sem serviço externo, sem cota de tokens:

| Camada | Onde | O que guarda |
|---|---|---|
| Contexto curado | `context/` (markdown) | overview, stack, ADRs, módulos, features, sessões |
| Pipeline e eventos | `.harness/harness.db` (SQLite) | tasks, eventos, interações, sessões |
| Sessões | `context/sessions/YYYY-MM-DD-<slug>.md` | resumo do que foi feito em cada sessão |

```bash
pnpm harness status                        # prime de sessão: WIP, ativas, worktrees, últimas sessões
pnpm harness session end "implementei o webhook; falta idempotência"
pnpm harness session list --limit 5
pnpm harness recall "webhook"              # busca em sessões, tasks, notas e docs
pnpm harness recall "webhook" --json
pnpm harness memory prune --days 90         # dry-run: sessões antigas
pnpm harness memory prune --days 90 --apply # arquiva em context/sessions/archive/AAAA-MM
```

- Sessões arquivadas **não são apagadas**; continuam encontráveis pelo `recall`.

- `status` na raiz de um workspace lista os projetos (sem entrar em loop).
- `recall` agrega resultados de todos os projetos quando rodado na raiz do workspace.
- Sessões, notas e handoffs passam por **redaction** (`sk-*`, JWT, `password=...`) antes de persistir.
- O gate `secrets` varre o repositório no `finish` e bloqueia se encontrar padrão de segredo.
- O banco é regenerável (`harness sync`) e gitignored; as sessões em markdown são versionadas.
  Exceção: as memórias em níveis (abaixo) vivem só no banco.

## Memória em níveis (`harness memory`)

Memória estruturada que os agentes reaproveitam entre execuções — sem injetar o banco inteiro no
prompt. Cada memória tem **nível**, **tipo**, **estado**, tags, origem (humano ou agente, task,
run), confiança, versão, último acesso e expiração.

| Nível | De quem | Entra no contexto da task quando |
|---|---|---|
| `task` | uma task (`--scope 07-x.md`) | é a própria task |
| `agent` | um agente (`--scope backend`) | é o agente da task (`## Agente`) |
| `project` | todos os agentes do projeto | casa com a task |
| `knowledge` | decisões técnicas e de arquitetura | casa com a task |
| `global` | entre projetos (`~/.alter-harness/memory.db` ou `HARNESS_HOME`) | `harness.json → memory.global: true` e casa com a task |
| `session` | uma execução (`--scope <run>`) | não entra (expira em 14 dias) |

Tipos: `fact` (verificado), `decision`, `discovery`, `assumption`, `observation` (temporária,
expira em 30 dias). Estados: `proposed` → `active` ou `rejected`; `outdated` quando substituída.

```bash
pnpm harness memory add "Deploy só via pipeline de CI" --level knowledge --kind decision --tags deploy,ci
pnpm harness memory add "Testes do runner usam tool falsa no PATH" --level agent --scope backend
pnpm harness memory add "Janela de deploy aberta" --level project --kind observation --ttl 12h
pnpm harness memory list [--level knowledge] [--status proposed] [--all] [--json]
pnpm harness memory search "deploy"                    # FTS5, ranking por relevância
pnpm harness memory show 12                            # metadados + cadeia de versões
pnpm harness memory approve 12 | reject 12             # revisão do que o agente propôs
pnpm harness memory update 12 "Deploy via CI com aprovação manual em produção"   # nova versão
pnpm harness memory outdate 12                         # tira do contexto sem apagar
pnpm harness memory add "Prefiro respostas em português" --level global          # global
pnpm harness memory list --global
```

- **Do humano** a memória entra `active`; texto igual (normalizado) no mesmo nível/escopo não
  duplica. Ao gravar, o harness aponta memórias ativas parecidas para você checar conflito.
- **No `harness run`** (CLI, lote e painel), o pacote de contexto ganha a seção `memory`: só
  memórias `active` e não expiradas, ranqueadas por relevância textual à task × peso do nível ×
  tipo × confiança × recência, dentro de `harness.json → memory.budget` (padrão **1500** tokens
  estimados; `0` desliga). As usadas ganham último acesso e contador.
- **O agente propõe**: o prompt pede, no fim do resumo, um bloco `MEMÓRIA:` com linhas
  `- <fato|decisão|descoberta|suposição|observação> [task|projeto|conhecimento|agente]: <texto> #tag`.
  Ao fim de um run concluído, cada linha vira memória **`proposed`** com origem no run — e só
  chega ao contexto depois de `harness memory approve`. Agente nunca escreve no nível global.
- Conteúdo passa por **redaction** antes de gravar. Busca sem acento (`autenticacao` acha
  "autenticação").

```jsonc
// harness.json
"memory": { "global": true, "budget": 1500 }
```

Limitações: as memórias vivem só no `.harness/harness.db` (gitignored; backup com
`harness memory list --all --json`); busca textual (FTS5), sem embeddings; conflitos são
apontados por semelhança, não detectados por modelo.

### Banco de dados (índice e histórico)

`scripts/harness` mantém um banco SQLite (`node:sqlite`, sem dependências) em `.harness/harness.db` (gitignored, regenerável via `harness sync`). O markdown continua sendo a **fonte da verdade** das tasks; o banco é um índice/histórico que auxilia a memorização:

- `tasks` — metadados das tasks (status, escopo, agente, módulo, dependência, timestamps de início/fim)
- `task_events` — trilha de eventos: `started`, `finished`, `requeued`, `reopened`, `out_of_scope`, `check_violation`, `synced`, `gate_failed`, `worktree_started`, `worktree_finished`
- `interactions` — registros livres (`prompt`/`response`/`note`/`system`) via `harness log`, associados ou não a uma task
- `sessions` — resumos de sessão (memória local)

O CLI grava eventos automaticamente em `start`/`finish`/`requeue`/`reopen`/`check`/`worktree`. Consultas:

```
pnpm harness sync                       # reindexa do markdown (idempotente)
pnpm harness log "decidimos usar event-sourcing" --task 05-events.md --kind note
pnpm harness history 05-events.md       # eventos + interações da task
pnpm harness check --db                 # detecta drift entre markdown e banco
```

## Métricas e observabilidade

`harness report` (table/json/csv) mostra WIP, cycle time, aging, throughput, distribuição por
módulo/agente, **gates falhos** (`gate_failed`) e **worktrees finalizadas** (`worktree_finished`).

`harness retro [--days 30]` gera `context/project/retro/AAAA-MM.md` com as métricas do período,
as sessões e placeholders para lições/ações — a cadência leve de melhoria contínua.

## Painel kanban

`harness kanban` visualiza o andamento em colunas queue/active/done.

- **Servidor com drag&drop:** `pnpm harness kanban --serve [porta]` (padrão 4310) sobe um servidor HTTP nativo, com bind em **127.0.0.1** (use `--host` explícito para expor). Arrastar um card dispara o mesmo pipeline do CLI — mover para `active` valida conflito de escopo; mover para `done` valida o `git diff`. Erros aparecem como toast. Auto-atualiza a cada 3s.
- **Estático:** `pnpm harness kanban` gera `kanban.html` auto-contido (sem drag&drop).
- **Detalhamento:** clique num card para ver escopo, arquivo da task, timeline de eventos e interações (funciona também no modo estático).
- **WIP limits (por projeto):** crie `.harness/kanban.json` no projeto com
  `{ "wip": { "active": 3, "queue": 8 } }`. O board mostra badges `count/limite` no header das
  colunas (vermelho quando no limite) e o servidor **bloqueia** o move que estoure o limite
  (toast com o motivo). No kanban agregado, o limite é avaliado por projeto dono do card.
- **Execução ao vivo:** no modo `--serve`, o header ganha o link "▶ vista Execução"
  (rota `/canvas`) — ver [Execução ao vivo (canvas)](#execução-ao-vivo-canvas).

## Execução de agentes (`harness run`)

Até aqui o harness **organiza** o trabalho; com `harness run` ele também **executa** o agente,
em modo não interativo, dentro da worktree da task, e grava cada passo no banco
(`runs` + `run_events` em `.harness/harness.db`).

```bash
pnpm harness start 12
pnpm harness worktree start 12
pnpm harness run 12 --tool claude            # ou --tool codex | --tool opencode --unsafe
pnpm harness events <run>                     # o que o agente fez, passo a passo
pnpm harness runs 12                          # status, duração, tokens e custo
pnpm harness worktree finish 12 --handoff "…" # revisão + integração continuam com você
```

O prompt enviado é a task completa, as regras fixas do protocolo (escopo estrito, não rodar
`finish`/`merge`/`push`, terminar com resumo) e o **pacote de contexto** da task (ver abaixo;
`--no-context` desliga, `--context-budget n` ajusta). Ele vai pelo **stdin** — nunca é
interpolado num comando de shell.

| Tool | Comando executado | Permissões | Uso reportado |
|---|---|---|---|
| `claude` | `claude -p --output-format stream-json --verbose` | `--permission-mode acceptEdits` (padrão; `default`/`plan` via flag) + deny do perfil de sandbox em `.claude/settings.json` | tokens + custo em USD |
| `codex` | `codex exec --json --sandbox workspace-write -` | sandbox do Codex (`workspace-write`) | tokens (sem custo em USD) |
| `opencode` | `opencode run --format json` | **exige `--unsafe`**: o `opencode run` pode aprovar edições e comandos sozinho | tokens + custo, somados por passo |
| `gemini` | `gemini --output-format stream-json` (stdin não-TTY) | `--approval-mode auto_edit` (padrão); `yolo` só com `--unsafe` | tokens no fim (sem custo em USD) |

- **Recusas claras**: task fora de `active/`, task sem worktree ou tool não instalada → erro com o
  próximo comando a rodar. Nada é simulado: sem a tool no PATH, nenhum run é aberto.
- **Eventos normalizados** (`run.started|completed|failed`, `agent.message|tool_call|tool_result|file_changed|usage|error`),
  com o evento original da tool preservado em `native` (`harness events <run> --native`).
  Linha que não é JSON também é guardada.
- **Medido × n/d**: tokens e custo só entram quando a tool reporta; caso contrário ficam `n/d`.
- **Segredos**: payloads passam por redaction antes de gravar.
- **Interrupção**: Ctrl+C ou `harness run --stop <run>` encerram a árvore de processos
  (`taskkill /T` no Windows) e marcam o run como `failed` (`interrupted`). Run cujo processo morreu
  vira `failed` (`orphaned`) no próximo `harness runs`.
- **Orçamento**: com `harness.json → budget`, o run é recusado se task/dia/mês já estouraram e é
  cortado durante a execução se o uso reportado passar do limite (ver "Orçamento").
- **`--unsafe`**: único caminho para liberar tudo (`bypassPermissions` no Claude,
  `danger-full-access` no Codex); fica gravado no run e aparece no `/canvas`.
- **Status**: implementado e testado com executáveis falsos que reproduzem o formato documentado de
  cada tool. A validação com as tools reais instaladas ainda está pendente.

### Lote paralelo (`run --batch`)

Vários agentes ao mesmo tempo, cada um na própria worktree:

```bash
pnpm harness run --batch 12,13,14 --tool claude --max-parallel 2
pnpm harness runs --batch <batch-id>                # o lote inteiro: status, tokens, custo
pnpm harness worktree finish 12 --handoff "…"       # integração continua task a task
```

1. **Validação** (nada é movido): task inexistente/ambígua, já em `done/`, repetida, sem `## Escopo`,
   dependência de outra task **do mesmo lote** ou conflito de escopo (dentro do lote ou com tasks
   ativas fora dele) → o lote é recusado com o motivo por task. Tool ausente também recusa antes.
2. **Preparação** (em sequência, com o lock do pipeline): `start` das tasks na queue (DoR como
   sempre) e `worktree start` de quem não tem. Task já ativa com worktree é reaproveitada. Se algo
   parar no meio, a saída lista o que já ficou preparado — nada é revertido sozinho.
3. **Execução**: no máximo `--max-parallel` agentes simultâneos (padrão `wip.active` do
   `harness.json`); a saída de cada um vem com o prefixo da task (`[12] 🔧 …`). A falha de uma
   task não interrompe as outras; Ctrl+C interrompe todas e as que ainda não começaram ficam
   `skipped`.
4. **Resumo**: uma linha por task (run, duração, tokens/custo ou erro) e exit code 1 se alguma
   falhou. Cada run guarda o `batch_id`, que aparece em `harness runs --batch` e no cartão do
   `/canvas` (🧩 lote).

Fora desta versão: ondas por dependência (B esperar A ser integrada), integração automática e
tool/modelo diferentes por task no mesmo lote.

### Orquestração encadeada (`harness flow`)

Um fluxo encadeia agentes na **mesma worktree** da task: um implementa, outro revisa, um corrige o
que a revisão pediu — e repete até a revisão aprovar ou acabarem as rodadas. Cada etapa é um run
normal (mesmas regras do `harness run`: orçamento, contexto, permissões), registrado no banco.

```bash
harness flow 12 --implement claude --review codex                 # corrige com a tool da implementação
harness flow 12 --implement claude:claude-sonnet-4-6 --review codex:gpt-5 --fix claude --rounds 3
harness flow 12 --implement claude --review codex --approve review   # pausa após cada revisão
harness flow show <flow>            # etapas, vereditos e o que a revisão pediu
harness flow resume <flow> [--note "use early return; não mexa na API"]
harness flow stop <flow> | list [<task>]
```

- **Revisor só lê**: recebe o diff da worktree contra a base (commits, não commitado e arquivos
  novos) e termina com `VEREDITO: APROVADO` ou `VEREDITO: MUDANÇAS` + lista. Claude revisa em modo
  `plan`, Codex com `--sandbox read-only`; para qualquer tool, o harness compara a worktree antes e
  depois — se o revisor alterou algo, a revisão é reprovada.
- **Correção**: recebe a lista da revisão e, se houver, as instruções do humano (`--note`), que têm
  prioridade.
- **Aprovação humana** (`--approve`): `none` (padrão) segue direto; `review` pausa depois de cada
  revisão; `each` pausa depois de cada etapa. `resume` segue (com `--note`, a instrução vai para a
  próxima etapa).
- **Fim**: revisão aprovada → `completed` (integre com `harness worktree finish`). Rodadas esgotadas
  (`--rounds`, padrão 2) → `needs_human`: `resume` concede mais uma rodada. Etapa que falha →
  `failed`: `resume` repete a etapa. Um fluxo aberto por task.
- **Pelo painel** (`harness serve`): botão "🔗 Fluxo" no cartão (tools por papel, rodadas, aprovação),
  "▶ Continuar fluxo" (com instruções), "■ Parar fluxo" e as etapas com veredito; API em
  `GET/POST /api/flows`, `GET /api/flows/:id`, `POST /api/flows/:id/resume|stop` (mesmo token e
  guardas da API de runs).

### Execução competitiva (`harness compete`)

Várias tools (ou modelos) resolvem a **mesma task** em paralelo, cada uma numa worktree própria
criada a partir do HEAD da worktree da task. O harness compara, um juiz opcional recomenda e você
escolhe qual mudança vai para a worktree da task.

```bash
harness compete 12 --tools claude,codex                          # 2 candidatas
harness compete 12 --tools claude:claude-sonnet-4-6,claude:claude-opus-4-5,codex --judge claude
harness compete show <comp>         # tabela: status, arquivos +/-, tokens, custo, tempo, escopo, juiz
harness compete pick <comp> <candidata>   # aplica a escolhida na worktree da task e apaga as outras
harness compete discard <comp> | list [<task>]
```

- A worktree da task precisa estar **sem mudanças pendentes** (a vencedora é aplicada sobre ela).
- Cada candidata é um run normal (orçamento, contexto, permissões), em
  `.worktrees/<task>--<candidata>` na branch `compete/<task>/<candidata>`. Chaves repetidas viram
  `claude`, `claude-2`…; `--max-parallel` limita quantas rodam ao mesmo tempo (padrão: todas).
- **Comparação**: status, arquivos e linhas alterados, tokens e custo (quando a tool reporta), tempo
  e arquivos **fora do escopo** da task.
- **Juiz** (`--judge`, opcional): recebe o diff de cada candidata, só lê (alterar a worktree descarta
  a recomendação) e termina com `VENCEDOR: <candidata>` ou `VENCEDOR: NENHUM`. Ele recomenda;
  quem escolhe é você.
- **pick**: a escolhida é aplicada na worktree da task como mudança pendente (squash, sem commit) e
  todas as worktrees/branches de candidatas são removidas — revise e integre com
  `harness worktree finish`. **discard** remove tudo sem aplicar.
- Uma competição aberta por task; não começa com um fluxo aberto na task.
- **Pelo painel** (`harness serve`): "🏁 Competição" no cartão (até 3 candidatas, modelo por
  candidata, juiz), tabela de comparação com "Escolher" por candidata e "Descartar"; API em
  `GET/POST /api/competitions`, `GET /api/competitions/:id`, `POST /api/competitions/:id/pick|discard`.

## Pacote de contexto (`harness context`)

Para o agente não redescobrir o projeto a cada task, o harness monta um **pacote compacto e
determinístico** a partir do que a própria task declara — sem LLM, sem embeddings:

```bash
pnpm harness context 12                       # markdown no terminal
pnpm harness context 12 --budget 4000         # corta por prioridade
pnpm harness context 12 --json | --out ctx.md # para outras ferramentas
```

| # | Seção | De onde vem |
|---|---|---|
| 1 | task | o arquivo da task (nunca sai) |
| 2 | regras | blocos "Regras inegociáveis" e "Guard Rails" do `AGENTS.md` |
| 3 | feature | `context/features/<feature>/spec.md` (`## Feature`) |
| 4 | módulo | `context.md` + os **3 handoffs mais recentes** do `status.md` (maior número de task) |
| 5 | dependências | último handoff registrado no banco de cada task em `## Depende de` |
| 6 | skills | `.agents/*.md` citados em `## Skills a carregar` |
| 7 | ADRs | ADRs citados no texto da task (`ADR-00N`) |
| 8 | escopo | por arquivo: existe?, tamanho, último commit (sem conteúdo) |
| 9 | histórico | últimos commits que tocaram o escopo |

- Só entra o que existe; tudo passa por redaction de segredos.
- Tokens são **estimados** (caracteres/4) e rotulados assim, por seção e no total.
- Com orçamento, a seção que não cabe sai inteira e é listada como omitida; seções menores de
  prioridade mais baixa ainda entram se couberem. A task nunca sai.
- No `harness run`/`run --batch` o pacote vai anexado ao prompt (sem repetir a task), com orçamento
  de `harness.json → context.budget` (padrão **8000**; `0` desliga). O tamanho fica no histórico da
  task (`context_built`).

### Otimizador de contexto

Ligado por padrão (`harness.json → context.optimize: false` desliga; `harness context <task> --full`
mostra o pacote integral). Sem LLM e sem custo:

- **Handoffs**: o mais recente entra inteiro; os anteriores só com o essencial (título, 1ª frase do
  "Feito", Pendências e Decisões). O detalhe continua no `status.md`.
- **Resumo antes de omitir**: seção que não cabe no orçamento entra como esqueleto (títulos + 1ª
  linha de cada parte) antes de ser cortada; só sai se nem assim couber.
- **Medição**: `harness context <task> --stats` mostra tokens por seção (otimizado × integral) e a
  economia; o `harness run` registra o tamanho e a economia em cada pacote (`context_built`).

**Digest do módulo** — quando o histórico cresce, um agente resume os handoffs:

```bash
harness context digest harness --tool claude [--model m] [--max-words 400] [--dry-run]
```

- O agente só lê (Claude em `plan`, Codex `read-only`; se alterar algo, o resultado é descartado) e
  responde entre `--- DIGEST ---` e `--- FIM ---`; o harness grava `context/modules/<m>/digest.md`
  (com origem e data). É um run normal (orçamento, uso, custo), registrado como `module:<m>`.
- O pacote de contexto passa a trazer o digest + o handoff mais recente; revise e commite o
  digest, e gere de novo quando o histórico crescer.

## Orçamento (`harness budget`)

Limites opcionais de tokens e/ou USD por escopo, no `harness.json`:

```jsonc
"budget": {
  "run":   { "tokens": 300000, "usd": 5 },  // uma execução
  "task":  { "usd": 20 },                   // soma de todos os runs da task
  "day":   { "usd": 50 },                   // runs iniciados hoje (data local)
  "month": { "usd": 500 }
}
```

```bash
pnpm harness budget            # consumo medido × limites: hoje, mês, tasks ativas (ok · perto · ESTOUROU)
pnpm harness budget --json
```

- **Só conta uso medido** (reportado pela tool). Runs sem uso reportado aparecem num aviso e não
  entram na soma — o consumido mostrado é um piso. Codex não reporta USD: limite em USD não se
  aplica a esses runs; limite em tokens sim.
- **Antes do run**: task, dia ou mês estourados → o `harness run` recusa com o motivo. No lote,
  dia/mês estourados recusam antes de preparar qualquer task, e cada task é checada na hora de
  começar (sem orçamento → `skipped`, motivo `budget`).
- **Durante o run**: o limite efetivo é o menor entre `budget.run` e o saldo de task/dia/mês. Quando o
  uso reportado passa dele — Claude por mensagem da API, Codex por turno, OpenCode por passo — o
  processo é encerrado e o run fica `failed` com motivo `budget` (o uso parcial reportado é gravado).
- **`--ignore-budget`**: roda mesmo assim e fica gravado no run (`budget_override`).
- Limitação: runs simultâneos de um lote só enxergam o gasto uns dos outros quando terminam (o saldo
  é calculado no início de cada task) — num lote grande, o total pode passar do limite do dia/mês.

## Qualidade pós-run e analytics

**Gates pós-run** — depois de cada run **concluído** (`harness run`, lote, painel, cada etapa de
implementação/correção de um fluxo e cada candidata de uma competição), o harness roda na worktree
os gates de `harness.json → gates.run` — os mesmos nomes de `gates.finish`/`gates.merge`: script do
`package.json` (`lint`, `test`, `typecheck`…) ou nativo (`secrets`, `links`, `test:affected`).

```jsonc
// harness.json
"gates": { "finish": ["scope", "secrets"], "merge": [], "run": ["lint", "test"] }
```

- Cada gate vira um evento `quality.gate` na timeline do run e o resultado agregado fica em
  `runs.quality` (`passed`, `failed` ou `skipped`). O run continua `completed` — o gate informa, não
  desfaz o trabalho do agente.
- Aparece no `harness run` (🧪), em `harness runs` (`completed · gates failed`), no cartão do canvas,
  na tabela da competição e, no fluxo, **vai para o revisor** junto com o diff.
- Rodam num processo separado (não travam o `harness serve`). `--no-gates` pula. Worktree sem
  `node_modules` com dependências declaradas: gate de script é pulado (`skipped`), ou falha com
  `gates.strict: true`.

**Analytics** — tokens, custo, sucesso, duração e gates das execuções, agrupados:

```bash
harness analytics                         # por tool, últimos 30 dias
harness analytics --by agent|model|task|day --since 7d|90d|all|2026-11-01 [--json]
```

- Só o uso **reportado** pelas tools entra nas somas; runs sem uso reportado são contados à parte
  ("sem uso") — o total é um piso, nunca estimativa.
- Painel em **`/analytics`** (no `kanban --serve` e no `harness serve`; link na vista Execução):
  totais, barras de custo e de tokens por grupo e tabela, com filtros de agrupamento e período;
  API `GET /api/analytics?by=&since=`.

## Execução ao vivo (canvas)

Quando o coordenador spawna N subagents em paralelo, o board mostra as tasks — mas não
**o que está rodando agora**. A vista "Execução" (rota `/canvas` do `kanban --serve`, mesmo
servidor) mostra um cartão ao vivo por task da coluna `active`:

| Campo do cartão | Origem |
|---|---|
| id + título + agente | markdown da task (`## Agente`) |
| worktree / branch | registro `.harness/worktrees.json` (fallback: "raiz" + branch atual) |
| tempo em execução | desde o evento `started` |
| arquivos alterados | `git status --porcelain` na worktree (`n/d` fora de repo/timeout) |
| último evento | último `task_event` no banco |
| última nota | última interação `--kind note` ("o agente reporta: …") |
| run do agente | run mais recente da task (`harness run`): tool · modelo, status, último evento do agente, tokens · custo (medido ou n/d) e lote (🧩, quando veio de `run --batch`) |

- **Staleness**: task sem atividade nova (evento, interação ou evento de run) há mais de **15 min** ganha badge e fundo
  amarelo (o cálculo é feito no servidor e os cartões stale vêm primeiro na ordenação).
- **Modal de histórico**: clique no cartão reabre o detalhamento do board (endpoint
  `GET /api/tasks/:id/detail`).
- **Auto-refresh** a cada 3s, alimentado por `GET /api/canvas`
  (`{ ok, generated_at, canvas[] }` já pré-computado para a UI).
- No `kanban --serve` a vista é só leitura. No **`harness serve`** ela ganha os controles dos
  agentes (Rodar, Parar, timeline ao vivo) — ver "API local e canvas interativo". A mudança de
  estado das tasks continua sendo pelo pipeline (`harness start`/`finish`/`worktree finish`). O
  kanban **estático** (`--out`) ainda não tem a vista.
- Multi-projeto no workspace: a vista é por projeto (o kanban agregado do workspace é
  outra superfície).

## API local e canvas interativo

O `harness serve` expõe uma **API local de execuções** e liga os controles da vista Execução
(`/canvas`): disparar o agente de uma task, parar e acompanhar a timeline ao vivo — sem terminal.
O disparo passa pelo **mesmo caminho do `harness run`**: task ativa, com worktree, orçamento
(`harness.json → budget`), pacote de contexto e as mesmas permissões por tool.

**No canvas** (cartão de uma task ativa):

- **▶ Rodar agente** — escolhe a tool instalada (lista de `harness runtimes`), modelo opcional,
  modo de permissões (Claude), orçamento de contexto, "ignorar orçamento" e "unsafe".
- **■ Parar** — aparece enquanto o run está rodando (mata a árvore de processos).
- **📜 timeline** — eventos do run ao vivo (mensagens, ferramentas, arquivos, uso), atualizados a
  cada 1,5 s; o detalhe da task lista as execuções anteriores.
- Task sem worktree mostra o comando para criá-la (`harness worktree start N`).

**Rotas** (JSON):

| Método e rota | O que faz |
|---|---|
| `GET /api/runtimes` | tools de agente instaladas (caminho, versão, se exige unsafe) |
| `GET /api/runs?task=&batch=&limit=` | runs recentes |
| `GET /api/runs/:id?after=<seq>` | run + eventos depois de `seq` (polling incremental; `&native=1` inclui o evento bruto) |
| `POST /api/runs` | `{ task, tool, model?, permissionMode?, unsafe?, ignoreBudget?, contextBudget? }` → **202** com o run (segue em segundo plano) |
| `POST /api/runs/:id/stop` | interrompe o run |

Erros vêm como `{ ok: false, error }`: 422 para validação do `harness run` (task fora de
`active/`, sem worktree, tool ausente, opencode sem unsafe), 409 para orçamento estourado ou run
já em andamento na task, 400 para body inválido.

**Segurança** (a API dispara processos na sua máquina):

- Bind em `127.0.0.1` por padrão. Toda leitura e escrita exige `Host` de loopback (ou o `--host`
  do bind) — protege contra DNS rebinding.
- Disparar e parar exigem o header **`X-Harness-Token`** com o token da sessão, gerado a cada
  start do serve, além de origem igual ao host. O canvas recebe o token embutido na página;
  outros clientes leem de **`.harness/serve.json`** (`url`, `pid`, `token`, `started_at`;
  gitignored, removido ao encerrar).
- `unsafe` só é aceito se o serve subiu com **`--allow-unsafe`** (aviso no banner).
- Um run por task por vez. Ao encerrar o serve, os runs disparados por ele são interrompidos.

```bash
node scripts/harness/bin/harness.js serve                 # canvas com controles em http://127.0.0.1:4310/canvas
node scripts/harness/bin/harness.js serve --allow-unsafe  # libera "unsafe" (necessário para o opencode)

# cliente da API (ex.: script ou app desktop)
TOKEN=$(node -e "console.log(require('./.harness/serve.json').token)")
curl -s -X POST http://127.0.0.1:4310/api/runs -H "x-harness-token: $TOKEN" \
  -H 'content-type: application/json' -d '{"task":"12","tool":"claude"}'
```

## Rotinas e `harness serve`

Trabalho repetitivo (retro semanal, triagem por webhook, task de revisão recorrente) dispara
**sem sessão humana** — mas a rotina nunca executa código por conta própria: ela só cria
tasks na queue; a execução é o pipeline de sempre, sob consentimento humano.

`harness serve` sobe em um processo zero-deps: (1) o servidor do kanban (board + drag&drop +
vista Execução), (2) o **agendador** das rotinas e (3) o **receiver de webhook**. Bind em
`127.0.0.1` (default; `--host` fora do loopback imprime WARNING de exposição), porta padrão
**4310** (a mesma do kanban — migrar de `kanban --serve` mantém a URL). Ctrl+C encerra com
graça (timers limpados, servidor fechado, lock do pipeline solto).

```bash
node scripts/harness/bin/harness.js serve            # kanban + rotinas + webhook
node scripts/harness/bin/harness.js serve --port 4444 --host 127.0.0.1
```

- Tick do agendador: **30s**. O `.harness/routines.json` é recarregado a cada tick — editar
  no ar não pede restart. Rotina com erro de schema é ignorada com aviso (`⚠️ rotinas: …`)
  e o `serve` continua de pé.
- **Sem catch-up**: se o serve estava fora do ar no horário, o disparo daquela janela é
  perdido (as próximas janelas seguem normais) — o webhook cobre execução sob demanda.
- O painel "⏱ Rotinas" decide presença no boot: criou o routines.json com o processo já
  no ar → reinicie o serve para o painel aparecer. Se routines.json existe mas o processo
  é o `kanban --serve` puro, o painel abre em modo **inativo** ("rode harness serve").

**`.harness/routines.json`** (gitignored, junto do banco; editado sempre à mão — nenhum
endpoint de UI):

```jsonc
{
  "routines": [
    {
      "id": "retro-semanal",                // a-z0-9 e "-"; é o id do webhook
      "every": "weekly@seg@09:00",          // <n>m | <n>h | daily@HH:MM | weekly@<seg..dom>@HH:MM
      "task": {
        "title": "Retro da semana",         // obrigatório; título normalizado vira o arquivo da task
        "module": "harness",                // opcional
        "agent": "backend",                 // opcional (default: backend)
        "priority": "P2",                   // opcional (P0–P3; default P2)
        "type": "docs",                     // opcional, conventional (default feat)
        "scope": ["context/project/retro/"] // opcional, paths repo-relative
      },
      "dedupe": true                        // não duplica task com o mesmo título em queue/active
    }
  ]
}
```

O disparo (agenda ou webhook) cria a task com a mesma lógica do `harness task` e grava
eventos no banco (`routine_fired` / `routine_skipped` / `routine_error` + interações
`source: routines`) — visíveis em `harness history` e `harness recall`.

**Disparo por webhook** (e o botão "▶ rodar agora" do painel usa o mesmo caminho, com o
token confirmado no servidor):

```bash
TOKEN=$(cat .harness/webhook-token)        # gerado na 1ª execução do serve; nunca impresso em log
curl -X POST "http://127.0.0.1:4310/webhook/routines/retro-semanal?token=$TOKEN"
```

| Resposta | Significado |
|---|---|
| `200 {"ok":true,"criada":"92-retro-da-semana.md","num":92}` | task criada na queue |
| `200 {"ok":true,"skip":"dedupe","task":…}` | task com o mesmo título já em queue/active (não duplica) |
| `401` | token ausente/errado (auditado como `webhook_rejected`) |
| `404` | id não existe no routines.json |

- O token mora em `.harness/webhook-token` (gitignored), é reusado entre execuções e
  comparado em tempo constante — o banner do serve nunca o imprime.
- `GET /api/routines` alimenta o painel: `{ok, routines: [{id, title, every, nextRun,
  lastRun, fireCount}]}` — `fireCount` conta disparos válidos (criada ou dedupe) e a
  contagem é reconstruída do banco ao reiniciar o serve.
- `POST /api/routines/<id>/run` é a rota do painel (mesmo núcleo do webhook: dedupe,
  auditoria e códigos HTTP idênticos).

## Perfis e `harness.json`

Perfis disponíveis (`harness profile` lista):

| Perfil | Esqueleto gerado |
|---|---|
| `web` | Monorepo pnpm/Turbo: `apps/api` (Fastify) + `apps/web` (Next.js) + `packages/contracts`/`api-client` |
| `api` | Monorepo: `apps/api` (Fastify) + `packages/contracts` |
| `cli` | CLI Node.js: `bin/cli.js` + `src/index.js` + testes |
| `script` | Script Node.js: `src/main.js` + testes |
| `game` | `src/scenes`, `src/systems`, `assets/` (engine a definir; LFS documentado em `game/README.md`) |
| `docs` | `docs/` em markdown, sem código de aplicação |
| `design` | `assets/` + `BRIEF.md` |
| `bare` | Só contexto + pipeline |

Cada projeto declara seu perfil em `harness.json` na raiz:

```jsonc
{
  "profile": "web",                       // web | api | cli | script | game | docs | design | bare
  "gates": {
    "finish": ["scope", "lint", "typecheck"],
    "merge": ["test", "build"]
  },
  "git": { "model": "trunk", "featureBranch": false },
  "wip": { "active": 3, "queue": 8 },
  "context": { "budget": 8000 },          // pacote de contexto no harness run (0 desliga)
  "budget": { "day": { "usd": 50 } }       // opcional: limites de custo (ver "Orçamento")
}
```

- O perfil define o peso do protocolo e os gates executados pelo `finish`/merge.
- `harness finish` roda `gates.finish` antes de mover a task: gate que falha bloqueia e registra
  `gate_failed`. `harness worktree finish` roda `gates.merge` antes do squash merge.
- `harness gates [--phase finish|merge] [--json]` roda os gates manualmente.
- `harness check` valida o arquivo quando presente; projetos antigos sem ele continuam válidos.
- `harness profile set <p>` troca o perfil (adota gates/WIP do perfil e preserva `git.baseBranch`);
  `harness profile current` mostra o perfil atual.
- `git.model: "trunk"` é o default (worktree por task + squash merge); `"gitflow"` fica como opção futura.

## Protocolo de execução de tarefa

O protocolo completo (8 passos, regras inegociáveis, guard rails e checklist de conclusão)
vive no **`AGENTS.md`** — fonte única. Este README não duplica o protocolo: leia o AGENTS.md
antes de operar o pipeline.

Resumo do que o agente faz: registra a task na queue → lê `context/` e `.agents/` →
executa com escopo estrito → atualiza `status.md` → conclui com `harness finish`.

## Planejamento de features

Via `.agents/feature-planning.md` — 5 fases em ordem:

1. **Clarificar** — entender o requisito com o humano (uma pergunta por vez).
2. **Mapear** — identificar módulos, camadas e agentes necessários.
3. **Confirmar** — apresentar plano e aguardar confirmação.
4. **Spec** — `harness feature <slug>` cria `context/features/<slug>/{spec.md,plan.md}`; a spec
   é a fonte da verdade, com critérios de aceitação (`AC-1`...).
5. **Gerar tasks** — criar arquivos em `tasks/queue/` com `## Feature: <slug>` e `## ACs`.

Ordem padrão de dependências:

```
1. Domain (entities, events)        ← base de tudo
2. Repository interface             ← contrato de dados
3. Use case(s)                      ← lógica de negócio
4. Repository Prisma + migration    ← persiste dados
5. Controller + Route               ← expõe na API
6a. Frontend ViewModel + View       ← paralelo com 6b e 6c
6b. Mobile Screen                   ← paralelo com 6a e 6c
6c. Regra CASL                      ← paralelo com 6a e 6b
7. Event handlers (notificações...) ← paralelo com 6*
```

## Exemplo de prompt

O AlterAI - Agentic OS é acionado por prompts em linguagem natural. O agente responde seguindo o fluxo: registra na queue, aplica o protocolo e aguarda consentimento antes de qualquer alteração.

**Bootstrap de projeto novo:**

```
Quero iniciar um projeto novo de SaaS B2B de gestão de clientes.
Siga o fluxo do AlterAI - Agentic OS: faça a context-interview (7 blocos, um por vez; subconjunto conforme o perfil,
confirmando antes de avançar) e gere overview, domain-model, stack e ADRs.
Ao final, monte a queue inicial com as primeiras tasks.
```

**Nova feature:**

```
Adicionar uma feature de gestão de assinaturas no módulo de billing.
Siga o fluxo do AlterAI - Agentic OS: planeje via feature-planning, apresente o plano
com módulos, camadas e tasks, e só comece a executar após minha confirmação.
```

**Execução de uma task da queue:**

```
Execute a task 04-module-audit.md da queue. Rode `pnpm harness start 04`
antes de começar, aplique o protocolo obrigatório, carregue codegen.md antes de
gerar código, toque apenas nos arquivos do ## Escopo e conclua com
`pnpm harness finish 04`, atualizando o status.md do módulo.
```

## Geração de código

Via `.agents/codegen.md` — 5 passos antes de gerar qualquer código:

```
1. REVISAR    → ler arquivos existentes do módulo alvo
2. MAPEAR     → listar o que pode ser reaproveitado
3. PERGUNTAR  → apresentar mapeamento e confirmar antes de gerar
4. GERAR      → apenas o confirmado, na densidade certa por camada
5. ANOTAR     → indicar o que foi reaproveitado vs criado
```

Nunca pular para o passo 4 sem completar 1, 2 e 3. Reuso de pacotes compartilhados segue a
referência de stack (ex.: `.agents/stack-ts-monorepo.md` para `@<escopo>/contracts`, `ui`,
`ui-mobile`, `api-client`) — nunca recriar o que já existe.

## Guard rails — execução somente com consentimento

As regras completas estão no `AGENTS.md` (fonte única). Em resumo: consentimento prévio,
escopo estrito, nada destrutivo em git/análise de dependências sem aprovação, pipeline
queue→active→done sempre, sem tarefas "bônus", e na dúvida: reportar e parar.

## Checklist de conclusão de tarefa

O checklist vive no `AGENTS.md` (com itens de stack conforme o perfil em `harness.json`).

## Índice de referências modulares

Carregue o arquivo relevante de `.agents/` antes de iniciar a tarefa:

| Situação | Carregar |
|---|---|
| Projeto novo ou módulo novo | `.agents/context-interview.md` |
| Nova feature para planejar | `.agents/feature-planning.md` |
| **Stack TypeScript + monorepo** (barrel, tenancy, MVVM, eventos, DI) | `.agents/stack-ts-monorepo.md` |
| Decisão de estrutura, novo package, fronteiras | `.agents/architecture.md` |
| **Qualquer geração de código** | `.agents/codegen.md` (sempre) |
| Tarefa de API (use-case, controller, repository) | `.agents/backend.md` |
| Tarefa de UI (componente, view, viewmodel) | `.agents/frontend.md` |
| Tarefa mobile (screen, hook mobile, offline) | `.agents/mobile.md` |
| Navegador em task (MCP Playwright por tool) | `.agents/browser.md` |
| Permissões, roles, CASL, abilities | `.agents/authorization.md` |
| Sandbox por tool (perfis minimal/strict) | `.agents/sandbox.md` |
| Stripe, planos, assinaturas, webhook | `.agents/billing.md` |
| Schema Prisma, queries, cache, analytics, ML | `.agents/data.md` |
| Deploy, CI/CD, EasyPanel/Coolify, EAS | `.agents/infra.md` |
| Testes (unitário, integração, E2E) | `.agents/testing.md` |
| Segurança, JWT, rate limit, LGPD | `.agents/security.md` |
| Logs, telemetria, erros, alertas | `.agents/observability.md` |
| Performance (API, web, mobile, banco) | `.agents/performance.md` |
| Orquestrar subagents em paralelo (coordenador) | `.agents/orchestration.md` |
| Revisar tasks concluídas (gate final) | `.agents/review.md` |

Uma tarefa pode exigir múltiplos arquivos. Exemplo: criar endpoint + regra de permissão → `codegen.md` + `backend.md` + `authorization.md`.