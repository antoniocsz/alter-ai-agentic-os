# Harness

Camada de operação que padroniza como agentes de IA trabalham em um projeto de software. O harness define o **protocolo obrigatório**, mantém o **contexto vivo** e gerencia o **pipeline de tarefas** — de forma reutilizável em qualquer projeto, independente do domínio ou da stack.

## Visão geral do fluxo

```
Bootstrap (projeto novo)
  └─ context-interview → overview.md, domain-model.md, stack.md, ADRs, queue inicial
        │
        ▼
Planejamento (por feature)
  └─ feature-planning → tasks geradas em context/agents/queue/
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

## Estrutura do harness

```
AGENTS.md            — arquivo base: protocolo, regras inegociáveis, guard rails, índices
.agents/             — referências modulares (carregar sob demanda por especialidade)
scripts/harness/     — CLI do harness (init, module, start, finish, check)
context/
├── project/         — visão do projeto (overview, domain-model, stack, ADRs)
├── modules/         — contexto e status por módulo (context.md + status.md)
└── agents/
    ├── queue/       — tarefas planejadas, não iniciadas
    ├── active/      — tarefa em execução AGORA (N, com escopos disjuntos)
    └── done/        — tarefas concluídas (histórico)
```

## CLI do harness

`scripts/harness` é um CLI em Node.js (zero dependências), invocado via `pnpm harness` a partir da raiz do projeto:

| Comando | O que faz |
|---|---|
| `harness init <dir>` | Gera projeto novo: camada harness + `context/` + monorepo mínimo |
| `harness module <nome>` | Scaffold de módulo (`packages/modules/<nome>/` + `context/modules/<nome>/`) |
| `harness start <task>` | Move `queue/` → `active/`, bloqueando conflito de escopo com tasks ativas |
| `harness finish <task>` | Valida `git diff` contra o `## Escopo` e move `active/` → `done/` |
| `harness check [flags]` | Valida o protocolo (pipeline, escopos, seções, módulos). Flags: `--json`, `--barrel`, `--lint`, `--typecheck` |

`<task>` aceita o nome completo (`04-api-routes-finance.md`) ou o prefixo numérico (`04`).

## Começando um projeto

1. **Inicializar:** `pnpm harness init <nome-do-projeto>` — gera AGENTS.md, `.agents/`, `scripts/harness/`, `context/` e o esqueleto do monorepo (turbo.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, `apps/api`, `packages/contracts`).
2. **Versionar:** `cd <nome-do-projeto> && git init && git add -A && git commit -m "chore: bootstrap harness"`.
3. **Instalar:** `pnpm install` (configs e dependências iniciais).
4. **Onboarding:** rodar a context-interview (7 blocos, abaixo) para preencher `context/project/overview.md` e `stack.md` e definir os ADRs iniciais.
5. **Criar módulos:** `pnpm harness module <nome>` para cada bounded context; preencher `context.md` e `status.md`.
6. **Planejar e executar:** criar tasks em `context/agents/queue/` (com `## Escopo`) e operar com `harness start` / `harness finish`.
7. **Verificar:** `pnpm harness check` a qualquer momento — também útil no CI.

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
| 7 | Prioridades | `context/agents/queue/` com tasks iniciais |

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

## Protocolo de execução de tarefa

Toda tarefa segue esta ordem:

```
1. Ler o AGENTS.md
2. Ler context/modules/<modulo>/context.md e status.md do módulo alvo
3. Carregar a referência modular relevante de .agents/<especialidade>.md
4. Carregar .agents/codegen.md ANTES de gerar qualquer código
5. Executar a tarefa
6. Atualizar context/modules/<modulo>/status.md ao terminar
7. Mover o arquivo de context/agents/active/ para context/agents/done/
8. Finalizar tarefas antigas da queue que foram concluídas
```

Os passos 2, 3 e 4 nunca são pulados. Nunca gerar código sem ler `.agents/codegen.md`.

## Planejamento de features

Via `.agents/feature-planning.md` — 4 fases em ordem:

1. **Clarificar** — entender o requisito com o humano (uma pergunta por vez).
2. **Mapear** — identificar módulos, camadas e agentes necessários.
3. **Confirmar** — apresentar plano e aguardar confirmação.
4. **Gerar tasks** — criar arquivos em `context/agents/queue/`.

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

O harness é acionado por prompts em linguagem natural. O agente responde seguindo o fluxo: registra na queue, aplica o protocolo e aguarda consentimento antes de qualquer alteração.

**Bootstrap de projeto novo:**

```
Quero iniciar um projeto novo de app de controle de gastos familiares.
Siga o fluxo do harness: faça a context-interview (7 blocos, um por vez,
confirmando antes de avançar) e gere overview, domain-model, stack e ADRs.
Ao final, monte a queue inicial com as primeiras tasks.
```

**Nova feature:**

```
Adicionar uma feature de metas mensais por categoria no módulo de finanças.
Siga o fluxo do harness: planeje via feature-planning, apresente o plano
com módulos, camadas e tasks, e só comece a executar após minha confirmação.
```

**Execução de uma task da queue:**

```
Execute a task 04-api-routes-finance.md da queue. Rode `pnpm harness start 04`
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

Nunca pular para o passo 4 sem completar 1, 2 e 3. Priorizar reuso de `@saas/contracts` (erros, EventBus, eventos), `@saas/ui`, `@saas/ui-mobile` e `@saas/api-client` — nunca recriar o que já existe.

## Guard rails — execução somente com consentimento

1. **Consentimento prévio obrigatório** — nenhuma alteração de código, dependências, configs, git ou arquivos (exceto os do plano aprovado) sem aprovação explícita. Apresentar plano → aguardar "pode executar".
2. **Escopo estrito** — tocar somente nos arquivos do plano aprovado. Qualquer descoberta fora do escopo: reportar e parar, nunca agir.
3. **Nunca `git checkout`/`restore`/`reset` sem aprovação** — se o working tree estiver num estado inesperado, parar e decidir junto com o usuário.
4. **`pnpm install` / `expo install` / package.json / lockfile só com aprovação** — instalar ou reconciliar dependências é mudança estrutural.
5. **Pipeline queue→active→done** — limpar a queue antes de iniciar, registrar a tarefa antes de começar, tasks ativas apenas com `## Escopo` disjuntos (validado por `harness start`/`check`), mover para `done/` via `harness finish`.
6. **Sem tarefas "bônus"** — não executar melhorias, limpezas ou correções não pedidas no plano aprovado.
7. **Sempre que houver dúvida sobre o estado do repositório, reportar antes de qualquer ação.**

## Checklist de conclusão de tarefa

- [ ] Código gerado segue as regras de `.agents/codegen.md`
- [ ] `context/modules/<modulo>/status.md` atualizado
- [ ] Arquivo em `context/agents/active/` movido para `context/agents/done/` (via `harness finish`)
- [ ] `git diff` dentro do `## Escopo` declarado (validado por `harness finish`)
- [ ] Decisão arquitetural nova registrada em `context/project/adr/` (se houver)
- [ ] Barrel export (`index.ts`) atualizado com novos exports
- [ ] Sem imports entre módulos diretos (ESLint boundaries)
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/<modulo>`

## Índice de referências modulares

Carregue o arquivo relevante de `.agents/` antes de iniciar a tarefa:

| Situação | Carregar |
|---|---|
| Projeto novo ou módulo novo | `.agents/context-interview.md` |
| Nova feature para planejar | `.agents/feature-planning.md` |
| Decisão de estrutura, novo package, fronteiras | `.agents/architecture.md` |
| **Qualquer geração de código** | `.agents/codegen.md` (sempre) |
| Tarefa de API (use-case, controller, repository) | `.agents/backend.md` |
| Tarefa de UI (componente, view, viewmodel) | `.agents/frontend.md` |
| Tarefa mobile (screen, hook mobile, offline) | `.agents/mobile.md` |
| Permissões, roles, CASL, abilities | `.agents/authorization.md` |
| Stripe, planos, assinaturas, webhook | `.agents/billing.md` |
| Schema Prisma, queries, cache, analytics, ML | `.agents/data.md` |
| Deploy, CI/CD, EasyPanel, EAS | `.agents/infra.md` |
| Testes (unitário, integração, E2E) | `.agents/testing.md` |
| Segurança, JWT, rate limit, LGPD | `.agents/security.md` |

Uma tarefa pode exigir múltiplos arquivos. Exemplo: criar endpoint + regra de permissão → `codegen.md` + `backend.md` + `authorization.md`.