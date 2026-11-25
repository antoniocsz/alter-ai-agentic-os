# Spec: otimizador-de-contexto

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: otimizador-de-contexto`.
> Criada em 2026-11-25.

## Problema

O pacote de contexto do `harness run` cresce com o projeto: handoffs longos repetem detalhes já no
código, e com orçamento a seção que não cabe sai inteira — o agente perde até o mapa do documento.
Cada run de fluxo ou competição paga esse custo de novo, e não há medição do quanto se gasta.

## Comportamento esperado

- Otimizador ligado por padrão (`context.optimize: false` desliga; `--full` mostra o integral):
  handoff mais recente inteiro, anteriores compactados (título, 1ª frase do Feito, Pendências,
  Decisões); seção que não cabe vira esqueleto (títulos + 1ª linha) antes de ser omitida.
- Medição: tokens por seção otimizado × integral e economia total (`harness context --stats`;
  registrada no `context_built` do run).
- `harness context digest <módulo> --tool <t>`: um agente só-leitura resume o histórico do
  `status.md` em `context/modules/<m>/digest.md` (gravado pelo harness); o pacote usa o digest.

## Critérios de aceitação

- [x] AC-1 — Handoffs anteriores compactados; o mais recente inteiro; config `context.optimize`.
- [x] AC-2 — Seção grande vira resumo antes de ser omitida por orçamento.
- [x] AC-3 — `--stats` e economia registrada; `--full` desliga.
- [x] AC-4 — `context digest`: agente só leitura, bloco parseável, harness grava; pacote usa o digest.
- [x] AC-5 — Zero dependências novas; testes.

## Estado (2026-11-25)

- Entregue nas tasks 132 (compactação, resumo, medição), 133 (digest do módulo) e 134 (docs).
- Validado com testes e no próprio repo (pacote da task 132: ~3964 tokens contra ~4108 integral —
  os handoffs deste repo já são curtos; a economia cresce com históricos longos e orçamento apertado).
- Pendente: gerar o digest do módulo `harness` com uma tool real e medir.
- Decisões: otimização determinística por padrão; digest por agente só sob demanda.

## Fora de escopo

- Resumo por LLM de seções que não sejam o histórico do módulo.
- Cache de contexto entre sessões de agente.
