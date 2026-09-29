# AlterAI - Agentic OS — Fonte do harness

## Problema

Agentes de IA precisam de uma camada de operação padronizada: um **protocolo obrigatório**,
**contexto vivo** e um **pipeline de tarefas** rastreável. Sem isso, cada projeto adota
convenções próprias e o trabalho dos agentes não é auditável nem seguro (quem tocou o quê,
em que escopo, com qual consentimento).

## Produto

Este repositório é a **fonte** do AlterAI - Agentic OS: a camada harness (CLI Node.js zero
deps + agents do opencode + referências modulares) que é **copiada** para N projetos via
`harness init` e **sincronizada** via `harness update`. Desde v0.1.0, também opera
**workspaces**: múltiplos projetos independentes gerenciados a partir de uma raiz, com
isolamento validado.

- **Pipeline queue → active → done** com validação de escopo (paralelismo seguro: N tasks ativas com `## Escopo` disjuntos)
- **Banco SQLite** (`node:sqlite`, zero deps) para andamento/histórico — regenerável via `harness sync`
- **Kanban agregado** multi-projeto com detalhamento (escopo, arquivo, timeline, interações)
- **Workspaces**: `init/new/add/list/status/check/sync/report/update/run/kanban` + flag global `--project`
- **Agents prontos** do opencode: coordinator, backend, frontend, mobile, reviewer

## Público

Quem desenvolve software com agentes de IA (o harness roda dentro de cada projeto do usuário).
O que o `harness init` gera (monorepo SaaS B2B/B2C com tenancy/auth/authorization/audit) é o
**produto do harness**, não a identidade deste repositório.

## Stack (deste repositório)

Node ≥ 22.5 (ESM) | zero dependências de runtime | `node:sqlite` | `node:test` | pnpm (só para o script `pnpm harness`)

## Princípios

- **Copy-per-project**: 1 fonte + N projetos independentes (cada um dono da própria camada, pode divergir)
- **Markdown é a fonte da verdade** das tasks; o banco é índice/histórico
- **Escopo estrito + consentimento**: guard rails aplicados em toda execução de agente
- **Isolamento por padrão** entre projetos: cruzar exige `--project`/`workspace run` explícito
- **Identidade de projeto em `context/project/`** — a camada do harness é uniforme entre projetos