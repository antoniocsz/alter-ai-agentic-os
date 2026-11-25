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

- [ ] AC-1 — Handoffs anteriores compactados; o mais recente inteiro; config `context.optimize`.
- [ ] AC-2 — Seção grande vira resumo antes de ser omitida por orçamento.
- [ ] AC-3 — `--stats` e economia registrada; `--full` desliga.
- [ ] AC-4 — `context digest`: agente só leitura, bloco parseável, harness grava; pacote usa o digest.
- [ ] AC-5 — Zero dependências novas; testes.

## Fora de escopo

- Resumo por LLM de seções que não sejam o histórico do módulo.
- Cache de contexto entre sessões de agente.
