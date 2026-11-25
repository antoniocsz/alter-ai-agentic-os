# Spec: qualidade-e-analytics

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: qualidade-e-analytics`.
> Criada em 2026-11-25.

## Problema

Um run "concluído" só diz que o agente terminou — não que o código passa em lint e testes. E o
uso registrado (tokens, custo, sucesso) não tem uma visão agregada: não dá para ver quanto cada
tool, modelo, agente ou task custa nem qual entrega com mais qualidade.

## Comportamento esperado

- `harness.json → gates.run`: gates (mesmos nomes de finish/merge) que rodam na worktree depois
  de cada run concluído — `harness run`, lote, painel, etapas de implementação/correção do fluxo e
  candidatas da competição. Resultado em eventos `quality.gate` e em `runs.quality`
  (passed|failed|skipped); o run continua concluído. Sem travar o `harness serve`. `--no-gates`.
- O revisor do fluxo recebe o resultado dos gates da última alteração; a competição mostra os
  gates de cada candidata.
- `harness analytics [--by tool|model|task|agent|day] [--since 30d|all|data] [--json]`: runs,
  sucesso, tokens, custo, duração média, gates ok e runs sem uso reportado. Só uso reportado soma.
- Painel `/analytics` (kanban --serve e harness serve) + `GET /api/analytics`.

## Critérios de aceitação

- [x] AC-1 — `gates.run` validado e executado após runs concluídos (todos os caminhos), sem bloquear o processo.
- [x] AC-2 — Resultado em `quality.gate` + `runs.quality`; visível no CLI, `harness runs`, canvas e competição; `--no-gates`.
- [x] AC-3 — Revisor do fluxo recebe os gates da última alteração.
- [x] AC-4 — `harness analytics` agrega por tool/modelo/task/agente/dia com período; uso não reportado fora das somas.
- [x] AC-5 — Painel `/analytics` e `GET /api/analytics`.
- [x] AC-6 — Zero dependências novas; testes.

## Estado (2026-11-25)

- Entregue nas tasks 128 (gates pós-run), 129 (analytics: CLI, API, painel) e 130 (docs).
- Validado com scripts reais de package.json (lint ok, test falhando), gates nativos, agente
  falso no run/fluxo e banco semeado no analytics.
- Pendente: ver com projeto real quanto tempo os gates acrescentam por run.
- Decisões: gate informa e não altera o status do run; período padrão do analytics 30 dias.

## Fora de escopo

- Correção automática quando um gate falha (o fluxo encadeado já cobre isso com revisão).
- Preço por modelo para estimar custo não reportado.
