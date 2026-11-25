# Spec: orquestracao-encadeada

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: orquestracao-encadeada`.
> Criada em 2026-11-25.

## Problema

O harness executa um agente por task (`harness run`) ou vários em paralelo (lote), mas não
encadeia agentes: não há revisão por outro agente, nem correção a partir da revisão, nem pausa
para o humano aprovar entre etapas. A visão do produto pede execução sequencial (um agente passa o
resultado ao outro), colaboração (pedir revisão) e humano no circuito.

## Comportamento esperado

- `harness flow <task> --implement <tool[:modelo]> --review <tool[:modelo]> [--fix <tool[:modelo]>]
  [--rounds n] [--approve none|review|each]` encadeia, na worktree da task:
  implementar → revisar → (corrigir → revisar)* até a revisão aprovar ou acabarem as rodadas.
- Cada etapa é um run normal (mesmas regras do `harness run`), ligado ao fluxo.
- **Revisor só lê**: recebe o diff da worktree contra a base e termina com `VEREDITO: APROVADO` ou
  `VEREDITO: MUDANÇAS` + lista. Claude em modo `plan`, Codex `--sandbox read-only`; o harness compara
  a worktree antes/depois e reprova a revisão que alterar algo. Sem veredito → etapa falha.
- **Correção** recebe a lista da revisão e as instruções do humano (prioridade).
- **Humano no circuito**: `--approve review|each` pausa (`waiting_approval`); `harness flow resume
  <flow> [--note "..."]` segue e leva a instrução à próxima etapa. Rodadas esgotadas →
  `needs_human` (resume concede mais uma). Falha → `failed` (resume repete a etapa). `stop` encerra.
- Estado no banco (`flows`, `flow_steps`); um fluxo aberto por task; `show`/`list` para inspeção.
- Painel (`harness serve`): iniciar fluxo, continuar com instruções, parar e ver as etapas; API
  `/api/flows`.

## Critérios de aceitação

- [ ] AC-1 — `harness flow` encadeia implementar → revisar → corrigir até aprovar, com tools por papel e `--rounds`.
- [ ] AC-2 — Revisor recebe o diff, não pode alterar a worktree (reprovado se alterar) e precisa dar veredito parseável.
- [ ] AC-3 — Correção recebe a revisão e as instruções do humano.
- [ ] AC-4 — `--approve` pausa; `resume [--note]`, `stop`, `show`, `list`; rodadas esgotadas pedem humano; falha permite repetir a etapa.
- [ ] AC-5 — API `/api/flows` e canvas (iniciar, continuar, parar, etapas) no `harness serve`.
- [ ] AC-6 — Zero dependências novas; testes com agente falso.

## Fora de escopo

- Execução competitiva (duas tools na mesma task em worktrees separadas, comparação) — próxima etapa.
- Decomposição automática da task por um coordenador.
