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

## Protocolo obrigatório — toda tarefa segue esta ordem

```
1. Ler este arquivo (AGENTS.md) e o Perfil do projeto (context/project/*)
2. Ler context/modules/<modulo>/context.md e status.md do módulo alvo
3. Carregar a referência modular relevante de .agents/<especialidade>.md
4. Carregar .agents/codegen.md ANTES de gerar qualquer código
5. Executar a tarefa
6. Atualizar context/modules/<modulo>/status.md ao terminar
7. Mover o arquivo de context/agents/active/ para context/agents/done/
8. Finalizar tarefas antigas da queue que foram concluídas
```

Nunca pule os passos 1, 2, 3 e 4. Nunca gere código sem ler .agents/codegen.md.

---

### Gestão de tarefas (queues / active / done)

**context/agents/** contém 3 pastas:

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

## Regras inegociáveis — violação bloqueia PR

### Fronteiras de módulo
```typescript
// ❌ NUNCA — import direto interno de outro módulo
import { algo } from '@<escopo>/outro-modulo/src/interno'

// ✅ SEMPRE — apenas via barrel export público
import { algo } from '@<escopo>/outro-modulo'
```

### tenantId em toda query tenant-scoped (se multi-tenant)
O middleware do ORM injeta automaticamente. Nunca confie em query sem o filtro.
Teste sempre: "tenant A não consegue ver dado de tenant B".

### MVVM estrito no frontend e mobile
- **View** → só JSX, zero `useQuery`/`useMutation`/`useForm` diretamente
- **ViewModel** → hook que orquestra tudo, retorna dados + callbacks prontos
- **Model** → tipos, schemas de validação, repository (sem hooks, sem JSX)

### Comunicação entre módulos via eventos
Módulos nunca se importam diretamente.
Publicar em `packages/contracts` → outro módulo assina. Nunca importar módulo B dentro de módulo A.

### Dependency Inversion no domínio
Use cases dependem de interfaces (repositories, providers), nunca de implementações.
```typescript
// ✅ UseCase recebe interface
constructor(private repo: OcorrenciaRepository, private eventBus: EventBus) {}
// ❌ UseCase instancia o ORM diretamente
```

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

---

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

Antes de marcar a tarefa como concluída:
- [ ] Código gerado segue as regras de `.agents/codegen.md`
- [ ] `context/modules/<modulo>/status.md` atualizado
- [ ] Arquivo em `context/agents/active/` movido para `context/agents/done/` (via `harness finish`)
- [ ] `git diff` dentro do `## Escopo` declarado (validado por `harness finish`)
- [ ] Decisão arquitetural nova registrada em `context/project/adr/` (se houver)
- [ ] Barrel export (`index.ts`) atualizado com novos exports
- [ ] Sem imports entre módulos diretos (ESLint boundaries)
- [ ] Typecheck passando: `pnpm turbo typecheck`