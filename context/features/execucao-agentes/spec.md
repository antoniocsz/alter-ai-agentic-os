# Spec: execucao-agentes

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: execucao-agentes`.
> Criada em 2026-11-20.

## Problema

O harness organiza o trabalho (pipeline, escopo, worktrees, gates, canvas), mas **não executa
agentes**: `adapter <tool>` só instala configuração, e Claude Code / Codex / OpenCode rodam por
fora. Consequências: o `/canvas` só vê eventos do pipeline e notas manuais (não o que o agente
está fazendo), não há registro de tokens/custo, e não dá para disparar uma task num runtime
a partir do harness. É a peça central que falta para a visão "Agent Harness Canvas"
(orquestração real de N runtimes em worktrees isoladas).

## Comportamento esperado

- `harness run <task> --tool claude|codex|opencode` executa a task **de verdade** no runtime
  escolhido, em modo não interativo, **dentro da worktree da task** (exige `worktree start`).
- O prompt é montado a partir do arquivo da task (+ instrução fixa do protocolo: respeitar o
  `## Escopo`, não rodar `finish`/`merge` — o humano/coordenador integra).
- A saída estruturada do runtime (JSONL) é lida linha a linha e gravada como **eventos de
  execução normalizados** (`run.started`, `agent.message`, `agent.tool_call`,
  `agent.tool_result`, `agent.file_changed`, `agent.usage`, `run.completed`, `run.failed`),
  preservando o evento original (`native`). Linha não-JSON nunca é descartada.
- Cada execução vira um registro **run** (task, tool, modelo, sessão, status, exit code,
  duração, tokens in/out, custo) com flag **medido × estimado**.
- `harness runs [<task>] [--json]` lista execuções; `harness events <run>` mostra a timeline.
- O `/canvas` passa a mostrar, por cartão, a execução em curso (tool, último evento do
  agente, tokens/custo acumulados).
- Permissões: o run usa o perfil de sandbox já instalado para a tool (task 87); nenhuma flag
  de "pular permissões" é passada sem pedido explícito do usuário (`--unsafe`).
- Ctrl+C / `harness run --stop <run>` encerra o processo filho e registra `run.failed`
  com motivo `interrupted`.

## Critérios de aceitação

- [x] AC-1 — Tabelas `runs` e `run_events` no `.harness/harness.db` (migração idempotente; `sync` não apaga); API `startRun/appendRunEvent/finishRun` + `harness runs` e `harness events <run>`.
- [x] AC-2 — `harness run <task> --tool claude` executa `claude -p` com saída `stream-json` dentro da worktree da task e grava eventos normalizados com `native` preservado.
- [x] AC-3 — `run` recusa task fora de active/ ou sem worktree, com mensagem acionável; tool não instalada → erro claro (sem simular execução).
- [x] AC-4 — Uso de tokens e custo reportados pelo runtime gravados com `measured: true`; ausentes ficam `null` (nunca inventados).
- [x] AC-5 — Interrupção encerra o processo filho (árvore no Windows) e registra `run.failed` (`interrupted`); run órfão (processo morto) é marcado `failed` no próximo `runs`.
- [x] AC-6 — `/canvas` e `GET /api/canvas` exibem tool, status do run, último evento do agente e tokens/custo da execução corrente da task.
- [x] AC-7 — `--tool codex` (`codex exec --json`) e `--tool opencode` (`opencode run --format json`) com o mesmo contrato de eventos.
- [x] AC-8 — Zero dependências novas; funciona no Windows (resolução de `.cmd`) e em POSIX; testes não exigem runtimes instalados (executável falso + transcrições gravadas).

## Estado (2026-11-23)

- Entregue nas tasks 93 (registro), 94 (runner + Claude), 95 (canvas), 96 (Codex/OpenCode),
  98 (identidade git no rebase) e 99 (docs).
- AC-2, AC-5 e AC-7 foram validados com executáveis falsos que reproduzem o formato
  documentado de cada tool (transcrições sintéticas em `tests/fixtures/runtimes/`).
  **Pendente:** execução real com Claude Code, Codex e OpenCode instalados e autenticados —
  se o formato real divergir, ajustar o driver e trocar a transcrição por uma gravada.
- Desvio da spec: permissão padrão do Claude é `acceptEdits` (não `default`), porque em `-p`
  o modo `default` nega as edições e o agente não consegue executar a task (handoff da 94).



- Gemini CLI e CLI genérico (próxima feature).
- Orquestração automática de lotes (`run --parallel`) e roteamento de modelo.
- Orçamento/limites de custo (só registro nesta feature).
- Controle de execução pelo canvas (botões) — canvas continua read-only.
- Retomada de sessão (`--resume`) — registrar `session_id` já, usar depois.
