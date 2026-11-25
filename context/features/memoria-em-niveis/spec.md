# Spec: memoria-em-niveis

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: memoria-em-niveis`.
> Criada em 2026-11-24.

## Problema

O harness guarda handoffs, sessões, notas e eventos, mas não tem uma memória estruturada que os
agentes reaproveitem: cada execução recomeça a investigação, decisões técnicas ficam espalhadas
em markdown e nada separa fato verificado de suposição ou observação temporária. A visão do
produto pede memória em níveis (global, projeto, agente, sessão, task, conhecimento), recuperação
por relevância dentro de um orçamento de tokens e aprovação humana do que é compartilhado.

## Comportamento esperado

- **Níveis**: `global` (entre projetos, só com autorização explícita), `project` (compartilhada
  pelos agentes do projeto), `knowledge` (decisões técnicas e de arquitetura validadas), `agent`
  (de um agente, ex.: `backend`), `task` (de uma task) e `session` (de uma execução; expira).
- **Tipos**: `fact` (verificado), `decision`, `discovery`, `assumption`, `observation`
  (temporária). Estados: `proposed` → `active` | `rejected`; `outdated` quando substituída.
- **Metadados**: conteúdo, nível, escopo, tipo, tags, origem (humano/agente), agente, task, run,
  confiança, versão, criação, atualização, último acesso, acessos, expiração.
- **CLI** `harness memory`:
  - `add "<texto>" --level <nível> [--scope s] [--kind k] [--tags a,b] [--ttl 7d] [--confidence 0.8]`
    — do humano entra `active`; duplicata (mesmo texto normalizado no mesmo nível/escopo) não cria
    outra linha; ao adicionar, lista memórias ativas parecidas para checar conflito.
  - `list [--level n] [--status s] [--all] [--json]`, `search "<termo>" [--level n] [--json]`
    (busca textual com ranking FTS5), `show <id>` (com histórico de versões).
  - `approve <id>`, `reject <id>`, `update <id> "<novo texto>"` (nova versão; a anterior fica
    `outdated`), `outdate <id>`.
- **Global**: banco em `~/.alter-harness/memory.db` (ou `HARNESS_HOME`). Lida pelo projeto só com
  `harness.json → memory.global: true`; escrita só pelo humano (`--level global`).
- **Na execução** (`harness run` e API local): o pacote de contexto ganha a seção `memory` com as
  memórias ativas relevantes para a task (task, agente da task, projeto, conhecimento e global se
  autorizada), ordenadas por relevância × nível × confiança × recência, dentro de um orçamento
  próprio. Nunca injeta o banco inteiro; `proposed`, `rejected`, `outdated` e expiradas ficam fora.
- **Agentes propõem**: o prompt pede um bloco `MEMÓRIA:` no resumo final (linhas
  `- <tipo>: <texto> #tag`); ao fim do run o harness grava cada linha como `proposed` (nível task
  por padrão, `project`/`knowledge` quando marcado) com origem no run. Só entra no contexto depois
  de `harness memory approve`.

## Critérios de aceitação

- [ ] AC-1 — Esquema `memories` (+ índice FTS5) no banco do projeto e no global; níveis, tipos e estados validados.
- [ ] AC-2 — `memory add` com dedupe, TTL, confiança, tags e aviso de memórias parecidas; humano → `active`.
- [ ] AC-3 — `memory list/search/show` com ranking textual, filtros e `--json`; expiradas fora por padrão.
- [ ] AC-4 — `approve/reject/update/outdate`; `update` versiona (nova linha, anterior `outdated`, `show` mostra a cadeia).
- [ ] AC-5 — Global separado, lido só com `memory.global: true`; agente nunca escreve no global.
- [ ] AC-6 — Pacote de contexto com seção `memory` por relevância e orçamento; registra último acesso.
- [ ] AC-7 — Bloco `MEMÓRIA:` do agente vira memórias `proposed` com origem no run (CLI, lote e API).
- [ ] AC-8 — Zero dependências novas; testes.

## Fora de escopo

- Busca semântica por embeddings (exige modelo/dependência; o ranking v1 é FTS5 + metadados).
- Memory Explorer visual (grafo/timeline) — fica para o app/canvas.
- Detecção automática de contradição por modelo (v1 só aponta memórias parecidas).
