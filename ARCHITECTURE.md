# Arquitetura — AlterAI - Agentic OS

Este documento descreve para onde o AlterAI - Agentic OS está indo: de uma **camada de
protocolo e pipeline** para o **núcleo headless** de um ambiente de desenvolvimento com
múltiplos agentes (visão "Agent Harness Canvas"). A decisão de construir o núcleo antes da
interface está em [ADR-006](context/project/adr/ADR-006-nucleo-headless.md).

O plano de execução por fases está em [ROADMAP.md](ROADMAP.md).

---

## 1. Avaliação do estado atual (Fase 0)

| Capacidade da visão | Estado | Onde está hoje |
|---|---|---|
| Task engine (estados, dependências, escopo) | ✅ base pronta | `src/lib/tasks.js`, `src/lib/pipeline.js` |
| Evitar escrita concorrente | 🟡 parcial | Escopo disjunto na **mesma** working tree (`start`/`finish`) |
| Workspaces multi-projeto | ✅ pronto | `src/workspace.js`, `src/lib/workspace.js` (ADR-005) |
| Persistência e histórico | 🟡 parcial | SQLite: `tasks`, `task_events`, `interactions` |
| Eventos de execução normalizados | ❌ ausente | Só eventos do pipeline (`started`, `finished`…) |
| Execução de agentes (runtimes) | ❌ ausente | Agentes rodam fora do harness (opencode) |
| Git worktrees por task/agente | ❌ ausente | — |
| Memória em níveis + busca | ❌ ausente | `interactions` é texto livre |
| Montagem de contexto / tokens | ❌ ausente | — |
| Custos e orçamento | ❌ ausente | — |
| Políticas e hooks aplicados | 🟡 só texto | Guard rails no `AGENTS.md` (disciplina, não enforcement) |
| Quality gates | 🟡 parcial | `harness check --lint --typecheck --barrel --db` |
| Papéis de agentes | 🟡 parcial | `.opencode/agent/*` (um runtime só) + `.agents/*.md` |
| Painel de execução | 🟡 embrião | Kanban (`harness kanban --serve`) |
| MCP Hub, Skills, Browser, Sandbox | ❌ ausente | — |
| App desktop (Canvas, IDE) | ❌ ausente | — |

**Risco principal hoje:** o paralelismo assume que vários agentes podem trabalhar na mesma
working tree desde que os escopos sejam disjuntos. A visão exige o oposto — cada agente/task
na sua própria worktree, com merge controlado.

---

## 2. Camadas

As cinco camadas da visão, com o que cada uma significa no núcleo:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Experience     CLI · kanban · API local (harness serve) · app desktop │  ← clientes
├──────────────────────────────────────────────────────────────────────┤
│ Intelligence   orquestrador · memória · context packager · roteador   │
├──────────────────────────────────────────────────────────────────────┤
│ Execution      task engine · worktrees · runtime adapters · sandbox   │
├──────────────────────────────────────────────────────────────────────┤
│ Extensibility  hooks · skills · commands · MCP · plugins              │
├──────────────────────────────────────────────────────────────────────┤
│ Platform       SQLite · event bus · políticas · segredos · backup     │
└──────────────────────────────────────────────────────────────────────┘
```

Regra de dependência: uma camada só depende das camadas abaixo dela. O núcleo (tudo menos
"Experience") é **zero deps**; a UI pode ter dependências.

---

## 3. Layout alvo do núcleo

```
scripts/harness/src/
├── lib/
│   ├── tasks.js  pipeline.js  git.js  db.js  workspace.js   ← existentes
│   ├── events.js          ← barramento de eventos normalizado (task 20)
│   ├── worktree.js        ← criação/limpeza/merge de worktrees (task 21)
│   ├── runtimes/
│   │   ├── adapter.js     ← contrato + capability discovery (task 22)
│   │   ├── registry.js    ← detecção e registro de runtimes
│   │   └── adapters/      ← claude-code.js (task 23), codex.js, gemini.js, opencode.js, generic.js
│   ├── context.js         ← pacote de contexto + estimativa de tokens (task 24)
│   ├── memory.js          ← memória em níveis (fase 3)
│   └── policy.js          ← políticas e hooks (fase 4)
└── <comando>.js           ← um arquivo por comando do CLI
```

---

## 4. Contratos principais

### 4.1 Evento normalizado

Todo acontecimento relevante vira uma linha em `events` (SQLite). Eventos do pipeline e dos
runtimes usam o mesmo formato.

```js
{
  id, ts,                         // ISO-8601
  type,                           // 'task.started' | 'agent.tool_call' | ...
  taskId, agentId, runtime, sessionId,
  payload,                        // objeto normalizado (JSON)
  native,                         // evento original do runtime, sem perda (JSON | null)
  measured                        // true = valor reportado pelo runtime; false = estimativa
}
```

Tipos iniciais: `task.created|started|finished|requeued|reopened|out_of_scope`,
`agent.started|message|tool_call|tool_result|file_changed|usage|waiting_approval|completed|failed`,
`worktree.created|merged|removed`, `check.violation`.

### 4.2 Runtime adapter

```js
export const adapter = {
  id: 'claude-code',
  detect(): Promise<{ installed, version, path }>,
  capabilities(): {
    streaming, nonInteractive, sessionResume, toolExecution, mcp,
    subagents, skills, permissionModes, usageReport, contextCompaction
  },
  run({ cwd, prompt, sessionId?, model?, permissions, env, signal }):
    AsyncIterable<NormalizedEvent>,   // eventos normalizados (com `native`)
  interrupt(handle): Promise<void>
}
```

Regras: nenhum adaptador pode simular execução; capacidade não declarada é tratada como
ausente; a orquestração nunca chama nada específico de um runtime fora do adaptador.

### 4.3 Worktree por task

- `harness start <task> --worktree` cria a branch `task/<nn>-<slug>` a partir de `HEAD` e a
  worktree em `.harness/worktrees/<nn>-<slug>`.
- O agente trabalha **só** dentro da worktree; `harness finish` valida o diff da branch
  contra o `## Escopo`.
- `harness merge <task>` integra a branch depois dos quality gates; `harness worktree clean`
  remove worktrees de tasks concluídas.
- Sem `--worktree`, o comportamento atual (mesma árvore + escopo disjunto) continua valendo.

### 4.4 Pacote de contexto

`harness context <task>` gera um pacote compacto: trechos relevantes do `AGENTS.md`, a task,
`context.md`/`status.md` do módulo, ADRs citados, lista dos arquivos do escopo (com tamanho)
e commits recentes que tocaram esses arquivos — com **estimativa** de tokens marcada como
estimativa.

---

## 5. Princípios (do prompt mestre, aplicados ao núcleo)

1. Agnóstico de provedor e de runtime — tudo específico fica no adaptador.
2. Nada de integração falsa: o que não executa de verdade não aparece como executado.
3. Todo evento é persistido; nenhum evento de agente é descartado em silêncio.
4. Medido ≠ estimado: tokens e custos sempre marcados.
5. Menor privilégio por padrão; operações sensíveis pedem aprovação.
6. Teste não executado nunca é reportado como aprovado.
7. Estado sobrevive a reinício (markdown + SQLite) e tasks longas são retomáveis.
