# AlterAI - Agentic OS

Camada de operação que padroniza como agentes de IA trabalham em um projeto de software. O AlterAI - Agentic OS define o **protocolo obrigatório**, mantém o **contexto vivo** e gerencia o **pipeline de tarefas** — de forma reutilizável em qualquer projeto, independente do domínio ou da stack.

## Índice

- [Começar agora (clonei este repo)](#começar-agora-clonei-este-repo)
- [Visão geral do fluxo](#visão-geral-do-fluxo)
- [Estrutura do AlterAI - Agentic OS](#estrutura-do-alterai---agentic-os)
- [CLI do AlterAI - Agentic OS](#cli-do-alterai---agentic-os)
- [Começando um projeto](#começando-um-projeto)
- [Usar em múltiplos projetos](#usar-em-múltiplos-projetos)
- [Bootstrap de projeto novo](#bootstrap-de-projeto-novo)
- [Pipeline de tarefas (queue → active → done)](#pipeline-de-tarefas-queue--active--done)
- [Execução em paralelo (subagents)](#execução-em-paralelo-subagents)
- [Agentes (subagents opencode)](#agentes-subagents-opencode)
- [Banco de dados (memória, andamento e interações)](#banco-de-dados-memória-andamento-e-interações)
- [Painel kanban](#painel-kanban)
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
context/
├── project/         — visão do projeto (overview, domain-model, stack, ADRs)
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
| `harness task "<desc>"` | Cria task na queue com numeração automática e `## Escopo`. Flags: `--module`, `--agent`, `--scope`, `--dep`, `--complexity` |
| `harness start <task>` | Move `queue/` → `active/`, bloqueando conflito de escopo com tasks ativas |
| `harness finish <task>` | Valida `git diff` contra o `## Escopo` e move `active/` → `done/`. Flag: `--handoff "<resumo>"` |
| `harness requeue <task>` | Move `active/` → `queue/` (devolve para a fila) |
| `harness reopen <task>` | Move `done/` → `active/` (reabre) |
| `harness sync` | Reindexa o banco SQLite (`.harness/harness.db`) a partir dos `.md` |
| `harness log "<texto>"` | Registra interação no banco. Flags: `--task`, `--kind`, `--source` |
| `harness history <task>` | Mostra eventos + interações de uma task (memorização) |
| `harness report` | Métricas do banco (WIP, cycle time, aging, throughput). Flags: `--format`, `--module`, `--days` |
| `harness kanban` | Painel kanban: `--serve [porta]` (drag&drop) ou `--out <arquivo>` (estático) |
| `harness check [flags]` | Valida o protocolo (pipeline, escopos, seções, módulos). Flags: `--json`, `--barrel`, `--lint`, `--typecheck`, `--db` |
| `harness version [--bump patch\|minor\|major]` | Mostra ou incrementa a versão do harness (registra a mudança no banco) |
| `harness changelog [--out <arquivo>]` | Gera `CHANGELOG.md` a partir dos handoffs (`harness finish --handoff`) |
| `harness workspace ...` | Opera sobre múltiplos projetos (ver "Workspaces" abaixo). Subcomandos: `init`, `new`, `add`, `list/status`, `check/sync/report/update [--all]`, `run`, `kanban` |

`<task>` aceita o nome completo (`01-module-tenancy.md`) ou o prefixo numérico (`01`).

## Começando um projeto

1. **Inicializar:** `pnpm harness init <nome-do-projeto> --profile <p> [--prisma] [--git]` — gera AGENTS.md, `.agents/`, `.opencode/agent/`, `scripts/harness/`, `harness.json`, `context/` e o esqueleto do perfil. Perfis: `web` (monorepo Fastify+Next), `api` (Fastify+contracts), `cli`, `script`, `game`, `docs`, `design`, `bare`. O perfil `web` já vem com os **módulos padrão** (tenancy, auth, authorization, audit) e tasks de fundação na queue. `--prisma` (web/api) adiciona `docker-compose.yml`, `packages/database` e `.env.example`; `--git` inicializa o repositório com commit inicial.
2. **Versionar:** `cd <nome-do-projeto> && git init && git add -A && git commit -m "chore: bootstrap harness"` (já feito com `--git`).
3. **Instalar:** `pnpm install` (configs e dependências iniciais).
4. **Banco local (com `--prisma`):** `docker compose up -d` e `cp .env.example .env`; scripts em `apps/api`: `db:up`, `db:migrate`, `db:deploy`.
5. **Onboarding:** rodar a context-interview (7 blocos, abaixo) para preencher `context/project/overview.md` e `stack.md` e definir os ADRs iniciais.
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
3. **Customizações de projeto ficam em `context/`, não na camada.** `harness update` sobrescreve `AGENTS.md`/`.agents/`/`.opencode/`/`scripts/` (com backup do AGENTS.md em `.harness/backups/`).
4. **Para divergir de verdade**, o projeto deixa de rodar `update` e evolui a própria camada — ou você mantém uma fonte por família de projeto (ex: `D:\projetos\harness-web`, `D:\projetos\harness-mobile`).

**Criar um projeto novo (a partir da fonte):**

```bash
node D:/projetos/harness/scripts/harness/bin/harness.js init D:/projetos/projeto-a [--prisma] [--git] [--bare]
```

**Atualizar a camada (de dentro de cada projeto):**

```bash
pnpm harness update --source D:/projetos/harness            # uma vez, ou
export HARNESS_SOURCE=/d/projetos/harness                  # memorizar a fonte (git bash)
pnpm harness update                                        # daí em diante
```

O `update` traz CLI/agents/AGENTS.md novos com backup automático e registra a versão da fonte.

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

> Projetos direto na raiz: crie o workspace com `--projects-dir .`. O padrão (`projects/`) também funciona; este workspace usa a raiz.

**Comandos:**

| Comando | O que faz |
|---|---|
| `harness workspace init <dir>` | Cria o workspace (camada harness + registro + cache do AGENTS.md). Flags: `--source`, `--projects-dir`, `--dry-run` |
| `harness workspace new <nome>` | Cria um projeto novo dentro do workspace. Flags: `--prisma`, `--git`, `--bare` |
| `harness workspace add <path>` | Registra projeto existente; se não tiver a camada, faz **onboarding** (backup do AGENTS.md, instala camada + esqueleto `context/`). Flags: `--name`, `--sync`, `--dry-run` |
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

Via `.agents/context-interview.md` — 7 blocos, um por vez, confirmando antes de avançar:

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

## Execução em paralelo (subagents)

Tasks ativas com `## Escopo` disjuntos rodam em paralelo. O `harness start` garante isso: se uma nova task sobrepuser o escopo de uma ativa, o start é bloqueado com a indicação do conflito.

Fluxo com subagents:

1. Planejar as tasks em `queue/` (via feature-planning), cada uma com `## Escopo` explícito.
2. Para cada task, rodar `harness start <task>` — o CLI valida o paralelismo e move para `active/`.
3. Spawnar um subagent por task ativa, cada um lendo o próprio arquivo de task (especificação + escopo).
4. Cada subagent executa o protocolo obrigatório e termina rodando `harness finish <task>` — que falha se o subagent tocou arquivo fora do escopo.
5. Ao final, `harness check` valida o conjunto e o coordenador revisa as tasks em `done/`.

Exemplo de prompt de orquestração:

```
Executar em paralelo as tasks 01-domain-transaction.md e 03-api-routes-transaction.md
da queue. Para cada uma, rode `pnpm harness start <task>` antes de iniciar o
subagent. Cada subagent deve ler o arquivo da task, respeitar o ## Escopo e
concluir com `pnpm harness finish <task>`. Ao final, rode `pnpm harness check`.
```

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

## Banco de dados (memória, andamento e interações)

`scripts/harness` mantém um banco SQLite (`node:sqlite`, sem dependências) em `.harness/harness.db` (gitignored, regenerável via `harness sync`). O markdown continua sendo a **fonte da verdade** das tasks; o banco é um índice/histórico que auxilia a memorização:

- `tasks` — metadados das tasks (status, escopo, agente, módulo, dependência, timestamps de início/fim)
- `task_events` — trilha de eventos: `started`, `finished`, `requeued`, `reopened`, `out_of_scope`, `check_violation`, `synced`
- `interactions` — registros livres (`prompt`/`response`/`note`/`system`) via `harness log`, associados ou não a uma task

O CLI grava eventos automaticamente em `start`/`finish`/`requeue`/`reopen`/`check`. Consultas:

```
pnpm harness sync                       # reindexa do markdown (idempotente)
pnpm harness log "decidimos usar event-sourcing" --task 05-events.md --kind note
pnpm harness history 05-events.md       # eventos + interações da task
pnpm harness check --db                 # detecta drift entre markdown e banco
```

## Painel kanban

`harness kanban` visualiza o andamento em colunas queue/active/done.

- **Servidor com drag&drop:** `pnpm harness kanban --serve [porta]` (padrão 4310) sobe um servidor HTTP nativo. Arrastar um card dispara o mesmo pipeline do CLI — mover para `active` valida conflito de escopo; mover para `done` valida o `git diff`. Erros aparecem como toast. Auto-atualiza a cada 3s.
- **Estático:** `pnpm harness kanban` gera `kanban.html` auto-contido (sem drag&drop).
- **Detalhamento:** clique num card para ver escopo, arquivo da task, timeline de eventos e interações (funciona também no modo estático).
- **WIP limits (por projeto):** crie `.harness/kanban.json` no projeto com
  `{ "wip": { "active": 3, "queue": 8 } }`. O board mostra badges `count/limite` no header das
  colunas (vermelho quando no limite) e o servidor **bloqueia** o move que estoure o limite
  (toast com o motivo). No kanban agregado, o limite é avaliado por projeto dono do card.

## Perfis e `harness.json`

Perfis disponíveis (`harness profile` lista):

| Perfil | Esqueleto gerado |
|---|---|
| `web` | Monorepo pnpm/Turbo: `apps/api` (Fastify) + `apps/web` (Next.js) + `packages/contracts`/`api-client` |
| `api` | Monorepo: `apps/api` (Fastify) + `packages/contracts` |
| `cli` | CLI Node.js: `bin/cli.js` + `src/index.js` + testes |
| `script` | Script Node.js: `src/main.js` + testes |
| `game` | `src/scenes`, `src/systems`, `assets/` (engine a definir) |
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
  "wip": { "active": 3, "queue": 8 }
}
```

- O perfil define o peso do protocolo e os gates esperados (motor de gates chega na Fase 4;
  até lá os comandos continuam operando só a validação de escopo).
- `harness check` valida o arquivo quando presente; projetos antigos sem ele continuam válidos.
- `git.model: "trunk"` é o default (worktree por task + squash merge); `"gitflow"` fica como opção futura.

## Protocolo de execução de tarefa

O protocolo completo (8 passos, regras inegociáveis, guard rails e checklist de conclusão)
vive no **`AGENTS.md`** — fonte única. Este README não duplica o protocolo: leia o AGENTS.md
antes de operar o pipeline.

Resumo do que o agente faz: registra a task na queue → lê `context/` e `.agents/` →
executa com escopo estrito → atualiza `status.md` → conclui com `harness finish`.

## Planejamento de features

Via `.agents/feature-planning.md` — 4 fases em ordem:

1. **Clarificar** — entender o requisito com o humano (uma pergunta por vez).
2. **Mapear** — identificar módulos, camadas e agentes necessários.
3. **Confirmar** — apresentar plano e aguardar confirmação.
4. **Gerar tasks** — criar arquivos em `tasks/queue/`.

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
Siga o fluxo do AlterAI - Agentic OS: faça a context-interview (7 blocos, um por vez,
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
| Permissões, roles, CASL, abilities | `.agents/authorization.md` |
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