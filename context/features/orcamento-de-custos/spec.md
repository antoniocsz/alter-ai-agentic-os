# Spec: orcamento-de-custos

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: orcamento-de-custos`.
> Criada em 2026-11-23.

## Problema

Com `harness run` e `run --batch`, vários agentes podem rodar ao mesmo tempo, e o harness já
registra tokens e custo de cada execução — mas nada impede gastar além do pretendido. Não há
limite por execução, por task, por dia ou por mês, nem uma visão do consumido contra esses limites.

## Comportamento esperado

- `harness.json → budget` declara limites opcionais (tokens e/ou USD) por escopo:
  ```jsonc
  "budget": {
    "run":   { "tokens": 300000, "usd": 5 },   // uma execução
    "task":  { "usd": 20 },                    // soma de todos os runs da task
    "day":   { "usd": 50 },                    // runs iniciados hoje (data local)
    "month": { "usd": 500 }
  }
  ```
- `harness budget [--json]` mostra o consumido **medido** contra cada limite (hoje, mês, tasks
  ativas) e quantos runs não reportaram uso — esses **não contam**, então o consumido é um piso.
- **Antes** de iniciar um run (único ou de lote): se task, dia ou mês já estouraram, o run é
  recusado com o motivo (`--ignore-budget` permite, e fica gravado no run).
- **Durante** o run: quando a tool reporta uso parcial (Claude por mensagem, Codex por turno,
  OpenCode por passo) e o run ultrapassa o limite efetivo (o menor entre o limite do run e o que
  resta de task/dia/mês), o processo é encerrado e o run fica `failed` com motivo `budget`.
- No lote, cada task é checada na hora de começar: se o orçamento acabou, ela fica `skipped`
  (`budget`) e as já em andamento seguem com o próprio limite.
- Custo em USD só existe quando a tool reporta (Codex não reporta) — limite em USD não se aplica a
  esses runs; limite em tokens sim. Nada é estimado.

## Critérios de aceitação

- [x] AC-1 — `budget` validado no `harness.json` (escopos run/task/day/month; tokens/usd > 0) e pelo `harness check`.
- [x] AC-2 — `harness budget [--json]` agrega só uso medido por dia/mês/task, compara com os limites e informa runs sem uso reportado.
- [x] AC-3 — Run recusado antes de iniciar se task/dia/mês estouraram; `--ignore-budget` permite e grava no run.
- [x] AC-4 — Corte durante o run quando o uso parcial reportado ultrapassa o limite efetivo; run `failed` com motivo `budget` e evento registrado.
- [x] AC-5 — Lote: task sem orçamento na hora de começar fica `skipped` (`budget`).
- [x] AC-6 — Claude reporta uso parcial a partir de `message.usage` (sem contar duas vezes a mesma mensagem); o total final do `result` prevalece.
- [x] AC-7 — Zero dependências novas; testes com runtime falso.

## Estado (2026-11-23)

- Entregue nas tasks 106 (`harness budget`, validação, agregação), 107 (recusa prévia, corte
  durante o run, skip no lote, `--ignore-budget`, parcial do Claude) e 108 (docs).
- Validado com runtime falso que reporta uso por mensagem (corte real do processo).
- Limitação conhecida: runs simultâneos de um lote não enxergam o gasto uns dos outros até
  terminarem. Pendente: validar o uso parcial com as tools reais.
- Decisão: `--ignore-budget` desliga todos os limites, inclusive o do run.



- Preço por modelo para estimar custo (só o que a tool reporta).
- Rebaixar o modelo automaticamente ao chegar perto do limite.
- Orçamento agregado do workspace (vários projetos).
