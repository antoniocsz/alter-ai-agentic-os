# Task: docs execucao de agentes run runs events
## Agente: `backend`
## Módulo: `harness`
## Feature: execucao-agentes
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-2, AC-6, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/commands/index.js`
- `README.md`
- `AGENTS.md`
- `context/features/execucao-agentes/spec.md`
## Depende de: [ ] `-`
## Contexto para ler: context/features/execucao-agentes/spec.md · handoffs das tasks 93–96 em context/modules/harness/status.md · scripts/harness/src/run.js · scripts/harness/src/runs.js
## Skills a carregar: —
## O que já existe: `harness run`/`runs`/`events` implementados (tasks 93–96), mas a ajuda geral mostra só `--tool claude`, o README não tem seção nem linhas na tabela do CLI, o AGENTS.md não cita a execução por agente e os ACs da spec continuam desmarcados.
## O que criar:
- `commands/index.js` → linha de ajuda do `run` com `claude|codex|opencode` e `--unsafe`
- `README.md` → linhas `run`/`runs`/`events` na tabela do CLI, seção "Execução de agentes (`harness run`)" (fluxo, tabela por tool, eventos, medido × n/d, interrupção, pendências) + linha do run na tabela do canvas + índice
- `AGENTS.md` → subseção curta "Execução por agente (`harness run`)" depois de "Execução com worktree"
- `spec.md` da feature → ACs entregues marcados, com o que ficou pendente (execução real)
## Especificação: documentar só o que existe e foi testado; deixar explícito que a execução real com as tools ainda não foi validada.
## Critério de conclusão:
- [ ] `harness help` mostra as três tools
- [ ] Links do índice do README resolvem para os headings
- [ ] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 99`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/99-docs-execucao-de-agentes-run-runs-events.md
