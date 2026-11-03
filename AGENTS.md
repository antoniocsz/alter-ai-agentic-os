# AGENTS.md

Arquivo base lido por todo agente antes de qualquer tarefa.
Contém: protocolo, regras globais, guard rails e índice de referências modulares.

---

## Perfil do projeto

Antes de qualquer tarefa, leia o contexto do projeto em `context/project/`:

- `overview.md` — produto e problema
- `domain-model.md` — domínio e módulos (bounded contexts)
- `stack.md` — stack técnica decidida
- `adr/` — decisões arquiteturais

Este `AGENTS.md` é a **base genérica do harness** (protocolo + guard rails), reutilizável em
qualquer projeto, independente do domínio ou da stack. As especificidades do projeto — stack,
tenancy, estrutura de apps/packages, escopo e nomeação — vivem em `context/project/*` e em
`context/modules/<modulo>/`. Se algo não estiver documentado, pergunte antes de assumir.

Nos exemplos deste arquivo e de `.agents/*.md`, `@<escopo>` é um placeholder para o escopo de
pacotes do seu projeto (ex: `@saas`, `@acme`).

---

## Peso por perfil

O `harness.json` do projeto declara o **perfil** (`web`, `api`, `cli`, `script`, `game`, `docs`,
`design`, `bare`). O perfil define:

- quais gates rodam no `finish`/merge e com quais comandos;
- quais seções de contexto e refs de `.agents/` são obrigatórias;
- o peso do protocolo: perfis `script`/`docs`/`design` usam o caminho enxuto (sem módulos,
  sem refs de stack TS), `web`/`api` usam o protocolo completo.

Se o perfil não estiver claro, leia `harness.json` e `context/project/stack.md` antes de assumir.

---

## Protocolo obrigatório — toda tarefa segue esta ordem

```
1. Ler este arquivo (AGENTS.md) e o Perfil do projeto (context/project/*)
2. Ler context/modules/<modulo>/context.md e status.md do módulo alvo; se a task declarar
   `## Feature: <slug>`, ler context/features/<slug>/spec.md (critérios de aceitação)
3. Carregar a referência modular relevante de .agents/<especialidade>.md
4. Carregar .agents/codegen.md ANTES de gerar qualquer código
5. Executar a tarefa
6. Atualizar context/modules/<modulo>/status.md ao terminar
7. Mover o arquivo de tasks/active/ para tasks/done/
8. Finalizar tarefas antigas da queue que foram concluídas
```

Nunca pule os passos 1, 2, 3 e 4. Nunca gere código sem ler .agents/codegen.md.

---

### Gestão de tarefas (queues / active / done)

**tasks/** contém 3 pastas:

| Pasta | Função |
|---|---|
| `queue/` | Tarefas planejadas, não iniciadas. Criar aqui ANTES de começar. |
| `active/` | Tarefa em execução AGORA. N podem coexistir desde que os escopos (`## Escopo`) sejam disjuntos. |
| `done/` | Tarefas concluídas. Manter histórico. |

O pipeline é operado pelo CLI: `pnpm harness start <task> | finish <task> | requeue <task> | reopen <task> | sync | check`. Eventos e interações ficam registrados em `.harness/harness.db` (SQLite); `harness kanban --serve` expõe o andamento num painel.

**Regras:**

1. **Sempre que um novo trabalho começar**, criar o arquivo em `queue/` antes (se não existir), depois mover para `active/` ao iniciar.
2. **Nunca pular a queue.** Se uma tarefa não tiver sido registrada na queue, registrar antes de executar.
3. **Ao finalizar,** mover de `active/` para `done/` E verificar se há tarefas antigas na queue que já foram concluídas — movê-las para `done/` também.
4. **Nome dos arquivos:** `<numero>-<descricao-curta>.md` (ex: `23-frontend-goals.md`, `32-subscriber-transaction-created.md`).
5. **Conteúdo:** titulo, escopo, referências a módulos afetados e checklist.
6. **Toda task declara `## Escopo`** — lista dos arquivos que vai tocar. `harness start` bloqueia tasks ativas com escopo sobreposto (paralelismo seguro); `harness finish` valida via git diff que só foram tocados arquivos do escopo.

---

### Execução com worktree (isolamento por task)

O modo recomendado de execução é **1 task = 1 worktree**:

```bash
pnpm harness start <task>            # queue → active (valida escopo)
pnpm harness worktree start <task>   # cria .worktrees/task-<n>-<slug> + branch task/<n>-<slug>
# ... trabalhe dentro da worktree ...
pnpm harness worktree finish <task> [--handoff "resumo"]
#   commit do que estiver sujo → rebase na base → gates.merge → squash merge → task done
pnpm harness worktree list | prune   # inspeção e limpeza
```

Regras:

- A base vem de `harness.json → git.baseBranch` (fallback `main`/`master`).
- O repositório principal precisa estar na base; o comando **não troca de branch** sozinho.
- Gate que falha aborta antes do merge e **preserva a worktree** para inspeção.
- `--keep` mantém a worktree após o merge; `--skip-gates` só para emergência explícita.
- Ao final, a worktree e a branch são removidas — nada de lixo em disco.

---

### Adaptadores de tool (multi-tool)

O projeto não fica preso a uma ferramenta:

- `harness adapter opencode|claude|codex` renderiza a camada de instruções da tool (saída descartável).
- `AGENTS.md` é a fonte canônica; `CLAUDE.md` importa com `@AGENTS.md`; Codex lê `AGENTS.md`.
- Pipeline, gates, worktrees e memória vivem no disco: trocar de tool no meio não perde estado.
- Papéis neutros ficam em `core/` (coordinator, executor, reviewer) no kit.

### Sessão (memória local)

O harness não depende de memória externa. O protocolo de sessão é:

```bash
pnpm harness status                          # ao iniciar: WIP, ativas, worktrees, últimas sessões
pnpm harness session end "<resumo do que foi feito>"   # ao encerrar
pnpm harness recall "<termo>"                # quando precisar lembrar de algo
```

- `status` evita "recomeçar do zero": mostra o que está ativo e o último handoff.
- `session end` grava em `.harness/harness.db` e em `context/sessions/YYYY-MM-DD-<slug>.md`.
- `recall` busca em sessões, tasks, notas, eventos e markdown do projeto (e de todos os
  projetos quando rodado na raiz do workspace).

---

## Regras inegociáveis (genéricas)

Violação bloqueia a conclusão da task (e o merge):

1. **Escopo estrito** — somente os arquivos declarados em `## Escopo` (validado por `harness finish`).
2. **Arquitetura declarada** — respeite `context/project/stack.md`, ADRs e as referências de
   `.agents/` aplicáveis. Não introduza padrões novos sem registrar ADR.
3. **Contratos públicos** — mudanças de interface entre partes (módulos, pacotes, apps, APIs)
   exigem atualização do contrato e do consumidor no mesmo escopo.
4. **Isolamento de dados** — nunca cruze limites de tenant/usuário/projeto sem filtro explícito.
5. **Dependências** — instalar/atualizar pacotes é mudança estrutural: exige aprovação (guard rail 4).

> Regras específicas de stack ficam nas referências modulares. Para TypeScript + monorepo
> (barrel exports, tenancy, MVVM, eventos, dependency inversion): `.agents/stack-ts-monorepo.md`.
> Outras stacks mantêm suas regras na referência correspondente do projeto.

---

## Guard Rails — execução somente com consentimento

Estas regras se aplicam a TODO agente e valem para QUALQUER tarefa, incluindo descobertas e emergências:

1. **Consentimento prévio obrigatório** — nenhuma alteração de código, dependências, configs, git ou arquivos (exceto os do plano aprovado) sem aprovação explícita. Apresentar plano → aguardar "pode executar".
2. **Escopo estrito** — tocar somente nos arquivos do plano aprovado. Qualquer descoberta fora do escopo (arquivos revertidos externamente, bugs, débito técnico): **reportar e parar**, nunca agir.
3. **Nunca `git checkout`/`restore`/`reset` sem aprovação** — reverter ou reescrever arquivos não mapeados é proibido. Se o working tree estiver num estado inesperado, parar e decidir junto com o usuário.
4. **`pnpm install` / `expo install` / package.json / lockfile só com aprovação** — instalar ou reconciliar dependências é mudança estrutural.
5. **Pipeline queue→active→done** — limpar a queue antes de iniciar (mover concluídas para done); registrar a tarefa na queue antes de começar; tasks ativas podem coexistir apenas com `## Escopo` disjuntos (validado por `harness start`/`check`); mover para done ao finalizar via `harness finish`.
6. **Sem tarefas "bônus"** — não executar melhorias, limpezas ou correções não pedidas no plano aprovado.
7. **Sempre que houver dúvida sobre o estado do repositório, reportar antes de qualquer ação.**
8. **Arquivos/pastas temporárias** — rascunhos, dumps, builds de teste e experimentos vivem em
   `.tmp/` (gitignored) e são **removidos ao terminar a tarefa**. Não deixar lixo ocupando disco
   no repositório nem no workspace; se um artefato precisar ficar, ele vira parte do escopo.

---

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
| Design, UI/UX, heurísticas de Nielsen, acessibilidade | `.agents/ui-ux.md` |
| Tarefa mobile (screen, hook mobile, offline) | `.agents/mobile.md` |
| Permissões, roles, CASL, abilities | `.agents/authorization.md` |
| Stripe, planos, assinaturas, webhook | `.agents/billing.md` |
| Schema do banco, queries, cache, analytics, ML | `.agents/data.md` |
| Deploy, CI/CD, EasyPanel/Coolify, EAS | `.agents/infra.md` |
| Testes (unitário, integração, E2E) | `.agents/testing.md` |
| Segurança, JWT, rate limit, LGPD | `.agents/security.md` |
| Logs, telemetria, erros, alertas | `.agents/observability.md` |
| Performance (API, web, mobile, banco) | `.agents/performance.md` |
| Orquestrar subagents em paralelo (coordenador) | `.agents/orchestration.md` |
| Revisar tasks concluídas (gate final) | `.agents/review.md` |

Agentes prontos (opencode, `.opencode/agent/`): `coordinator`, `backend`, `frontend`, `mobile`, `reviewer`.

Uma tarefa pode exigir múltiplos arquivos.
Exemplo: criar endpoint + regra de permissão → `codegen.md` + `backend.md` + `authorization.md`.

---

## Checklist de conclusão de tarefa

Antes de marcar a tarefa como concluída (itens de stack conforme o perfil):
- [ ] Código gerado segue as regras de `.agents/codegen.md`
- [ ] `context/modules/<modulo>/status.md` atualizado (perfis com código)
- [ ] Arquivo em `tasks/active/` movido para `tasks/done/` (via `harness finish`)
- [ ] `git diff` dentro do `## Escopo` declarado (validado por `harness finish`)
- [ ] Decisão arquitetural nova registrada em `context/project/adr/` (se houver)
- [ ] Gates do perfil (`harness.json`) passando — o `finish` bloqueia se algum falhar
- [ ] Ref de stack carregada e cumprida (ex.: `.agents/stack-ts-monorepo.md`)