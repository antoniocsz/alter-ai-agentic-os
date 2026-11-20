# ADR-006: Núcleo headless primeiro, app desktop depois

**Data:** 2026-11-20
**Status:** proposed

## Contexto

A visão do produto (Agent Harness Canvas) é um ambiente de desenvolvimento em que vários
agentes de IA (Codex, Claude Code, Gemini CLI, OpenCode…) trabalham em paralelo, com memória
compartilhada, worktrees isoladas, sandbox, observabilidade e um canvas visual de orquestração.

Hoje o AlterAI - Agentic OS é um CLI Node sem dependências que **organiza** o trabalho
(pipeline queue → active → done, escopo disjunto, SQLite, kanban, workspaces), mas **não
executa** agentes: eles rodam por fora (ex.: dentro do opencode) e só seguem o protocolo.

Há dois caminhos para chegar à visão:

1. Começar pelo app desktop (Tauri + React + React Flow + Monaco) e construir a execução por
   baixo da interface.
2. Transformar o CLI no **núcleo headless** do produto (eventos, worktrees, runtimes, memória,
   contexto, políticas) e só depois construir o app desktop como cliente desse núcleo.

## Decisão

Adotar o caminho 2.

- O núcleo continua em `scripts/harness/` como **monólito modular**, Node ≥ 22.5, **zero
  dependências de runtime** (`node:sqlite`, `node:child_process`, `node:http`).
- Toda capacidade nova nasce como **comando do CLI + módulo em `src/lib/`**, testável com
  `node:test`, antes de ter qualquer interface gráfica.
- A interface é um **cliente**: hoje o kanban (`harness kanban --serve`); amanhã uma API local
  (`harness serve`) consumida pelo app desktop.
- O app desktop, quando vier, mora em pacote próprio e **pode** ter dependências (React,
  Tauri etc.). O princípio "zero deps" vale para o núcleo, não para a UI.
- Markdown continua sendo a fonte da verdade das tasks; o SQLite passa a ser também o
  **log de eventos normalizado** de execução.

## Consequências positivas

- O que já funciona (pipeline, escopo, workspaces, testes 69/69) é preservado e vira a base.
- Cada capacidade é verificável sozinha pelo terminal e no CI, sem depender da UI.
- O Canvas, quando existir, mostra execuções **reais** (regra 1 do prompt mestre: nada de
  integração simulada apresentada como real).
- O mesmo núcleo pode servir CLI, app desktop, painel web e, no futuro, execução remota.

## Trade-offs aceitos

- A visão visual (Canvas, Agents Studio, Command Center) demora mais para aparecer.
- Escrever adaptadores de runtime e worktrees sem dependências exige mais código próprio
  (parse de JSONL, gestão de processos filhos).

## Alternativas descartadas

- **UI primeiro:** risco alto de telas sem execução real por trás e de acoplar a orquestração
  à camada visual.
- **Reescrever em TypeScript/Rust agora:** descartaria a base testada sem ganho funcional
  imediato; pode ser reavaliado quando o núcleo estiver estável.
