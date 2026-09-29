# ADR-005: Workspaces — múltiplos projetos com isolamento validado

**Data:** 2026-09-29
**Status:** accepted

## Contexto

Com N projetos independentes (ADR-004), operar cada um exige `cd` manual e não há visão
agregada nem comandos em lote. Surge a necessidade de uma camada de **workspace**: um diretório
que agrupa os projetos e oferece operação unificada, **sem** quebrar o isolamento entre eles.

## Decisão

Adotar um **workspace** = diretório raiz com:
- Registro `.harness-workspace.json` — `{ version, harnessSource, projectsDir, projects[] }`,
  com paths **relativos à raiz** (portável) resolvidos para absoluto em memória;
- Cópia da camada harness na raiz (fonte para `workspace new`/`add`) + cache do AGENTS.md
  padrão em `.harness/workspace/AGENTS.md`;
- Comandos agregados: `init`, `new`, `add` (onboarding de projeto existente), `list/status`,
  `check/sync/report/update [--all]`, `run <projeto> <cmd>`, `kanban` (board multi-projeto);
- Flag global `--project <projeto>` em qualquer comando (resolve via discovery ascendente de
  cwd; fallback `HARNESS_WORKSPACE`).

**Isolamento por padrão:** comandos rodam no cwd; cruzar projetos exige `--project`/`run`
explícito. `harness check` na raiz do workspace (ou `workspace check`) valida o registro:
nomes/paths duplicados, árvores aninhadas, raiz do workspace, paths inexistentes.

## Consequências positivas

- Operação em lote (`check --all`, `update --all`, `report --all`, kanban agregado) sem
  sacrificar o isolamento
- `add` com onboarding permite incorporar projetos legados (backup do AGENTS.md, camada + context/)
- Validação automática de isolamento vira checagem, não disciplina manual

## Trade-offs aceitos

- Workspace adiciona uma camada de conceitos (registro, projetosDir, discovery)
- Projeto fora da árvore do workspace depende de `HARNESS_WORKSPACE` para `--project`

## Alternativas descartadas

- **Monorepo único (workspace pnpm incluindo sub-monorepos):** pnpm não suporta workspaces
  aninhados; quebraria a independência de git/camada de cada projeto
- **Sem registro (descobrir por convenção de pasta):** ambíguo e sem validação de isolamento
- **Kanban separado por projeto:** perde a visão agregada pedida pelo usuário