# AGENTS.md

Arquivo base lido por todo agente antes de qualquer tarefa.
Contém: regras globais, stack, e índice de referências modulares.

---

## Protocolo obrigatório — toda tarefa segue esta ordem

```
1. Ler este arquivo (AGENTS.md)
2. Ler context/modules/<modulo>/context.md e status.md do módulo alvo
3. Carregar a referência modular relevante de .agents/<especialidade>.md
4. Carregar .agents/codegen.md ANTES de gerar qualquer código
5. Executar a tarefa
6. Atualizar context/modules/<modulo>/status.md ao terminar
7. Mover o arquivo de context/agents/active/ para context/agents/done/
8. Finalizar tarefas antigas da queue que foram concluídas
```

Nunca pule os passos 2, 3 e 4. Nunca gere código sem ler .agents/codegen.md.

---

### Gestão de tarefas (queues / active / done)

**context/agents/** contém 3 pastas:

| Pasta | Função |
|---|---|
| `queue/` | Tarefas planejadas, não iniciadas. Criar aqui ANTES de começar. |
| `active/` | Tarefa em execução AGORA. Apenas 1 por vez. |
| `done/` | Tarefas concluídas. Manter histórico. |

**Regras:**

1. **Sempre que um novo trabalho começar**, criar o arquivo em `queue/` antes (se não existir), depois mover para `active/` ao iniciar.
2. **Nunca pular a queue.** Se uma tarefa não tiver sido registrada na queue, registrar antes de executar.
3. **Ao finalizar,** mover de `active/` para `done/` E verificar se há tarefas antigas na queue que já foram concluídas — movê-las para `done/` também.
4. **Nome dos arquivos:** `<numero>-<descricao-curta>.md` (ex: `23-frontend-goals.md`, `32-subscriber-transaction-created.md`).
5. **Conteúdo:** titulo, escopo, referências a módulos afetados e checklist.

---

## Stack do projeto

**Monorepo:** Turborepo + pnpm workspaces
**Backend:** Fastify + Prisma + PostgreSQL + Redis
**Frontend:** Next.js 16 (App Router) + TanStack Query + Zustand + nuqs + React Hook Form + Zod + shadcn/ui + Tailwind v4
**Mobile:** Expo (bare workflow) + Expo Router + MMKV + WatermelonDB
**Auth:** JWT (15min) + Refresh Token (7d, rotation) + CASL (RBAC+ABAC)
**Billing:** Stripe via PaymentProvider interface (DIP)
**Analytics:** ClickHouse + Metabase + ETL cron
**Deploy:** EasyPanel (VPS) + EAS (mobile) + GitHub Actions

---

## Regras inegociáveis — violação bloqueia PR

### Fronteiras de módulo
```typescript
// ❌ NUNCA — import direto interno de outro módulo
import { algo } from '@saas/outro-modulo/src/interno'

// ✅ SEMPRE — apenas via barrel export público
import { algo } from '@saas/outro-modulo'
```

### tenantId em toda query tenant-scoped
O middleware Prisma injeta automaticamente. Nunca confie em query sem o filtro.
Teste sempre: "tenant A não consegue ver dado de tenant B".

### MVVM estrito no frontend e mobile
- **View** → só JSX, zero `useQuery`/`useMutation`/`useForm` diretamente
- **ViewModel** → hook que orquestra tudo, retorna dados + callbacks prontos
- **Model** → tipos, schemas Zod, repository (sem hooks, sem JSX)

### Comunicação entre módulos via eventos
Módulos nunca se importam diretamente.
Publicar em `@saas/contracts` → outro módulo assina. Nunca importar módulo B dentro de módulo A.

### Dependency Inversion no domínio
Use cases dependem de interfaces (repositories, providers), nunca de implementações.
```typescript
// ✅ UseCase recebe interface
constructor(private repo: OcorrenciaRepository, private eventBus: EventBus) {}
// ❌ UseCase instancia Prisma diretamente
```

---

## Guard Rails — execução somente com consentimento

Estas regras se aplicam a TODO agente e valem para QUALQUER tarefa, incluindo descobertas e emergências:

1. **Consentimento prévio obrigatório** — nenhuma alteração de código, dependências, configs, git ou arquivos (exceto os do plano aprovado) sem aprovação explícita. Apresentar plano → aguardar "pode executar".
2. **Escopo estrito** — tocar somente nos arquivos do plano aprovado. Qualquer descoberta fora do escopo (arquivos revertidos externamente, bugs, débito técnico): **reportar e parar**, nunca agir.
3. **Nunca `git checkout`/`restore`/`reset` sem aprovação** — reverter ou reescrever arquivos não mapeados é proibido. Se o working tree estiver num estado inesperado, parar e decidir junto com o usuário.
4. **`pnpm install` / `expo install` / package.json / lockfile só com aprovação** — instalar ou reconciliar dependências é mudança estrutural.
5. **Pipeline queue→active→done** — limpar a queue antes de iniciar (mover concluídas para done); registrar a tarefa na queue antes de começar; apenas 1 ativa por vez; mover para done ao finalizar.
6. **Sem tarefas "bônus"** — não executar melhorias, limpezas ou correções não pedidas no plano aprovado.
7. **Sempre que houver dúvida sobre o estado do repositório, reportar antes de qualquer ação.**

---

## Hierarquia de tenancy

```
Platform (você)
  └─ Organization (empresa que contrata)
       └─ ClientAccount (cliente final)
```

Roles: `platform-admin` | `org-owner` | `org-member` | `client-user`

---

## Estrutura do monorepo

```
apps/
├── admin/          @saas/app-admin        — gestão interna
├── landing/        @saas/app-landing      — marketing/SEO
├── organization/   @saas/app-organization — painel org
├── client/         @saas/app-client       — painel cliente
├── mobile/         @saas/app-mobile       — Expo bare
└── api/            @saas/app-api          — Fastify

packages/
├── modules/        @saas/<feature>        — bounded contexts
├── ui/             @saas/ui               — design system web
├── ui-mobile/      @saas/ui-mobile        — componentes RN
├── api-client/     @saas/api-client       — http client
├── contracts/      @saas/contracts        — tipos e eventos
└── config/         @saas/{eslint,tsconfig,tailwind}-config

context/            — documentação viva + estado de agentes
.agents/            — referências modulares (carregar sob demanda)
```

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
| Schema Prisma, queries, cache, analytics, ML | `.agents/data.md` |
| Deploy, CI/CD, EasyPanel, EAS | `.agents/infra.md` |
| Testes (unitário, integração, E2E) | `.agents/testing.md` |
| Segurança, JWT, rate limit, LGPD | `.agents/security.md` |

Uma tarefa pode exigir múltiplos arquivos.
Exemplo: criar endpoint + regra de permissão → `codegen.md` + `backend.md` + `authorization.md`.

---

## Checklist de conclusão de tarefa

Antes de marcar a tarefa como concluída:
- [ ] Código gerado segue as regras de `.agents/codegen.md`
- [ ] `context/modules/<modulo>/status.md` atualizado
- [ ] Arquivo em `context/agents/active/` movido para `context/agents/done/`
- [ ] Decisão arquitetural nova registrada em `context/project/adr/` (se houver)
- [ ] Barrel export (`index.ts`) atualizado com novos exports
- [ ] Sem imports entre módulos diretos (ESLint boundaries)
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/<modulo>`
