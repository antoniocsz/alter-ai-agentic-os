# Spec: runtime-gemini

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: runtime-gemini`.
> Criada em 2026-11-24.

## Problema

O `harness run` executa Claude Code, Codex e OpenCode. O Gemini CLI — o quarto runtime citado na
visão — não tem driver: não dá para usá-lo em `run`, `run --batch`, no orçamento nem no `/canvas`.

## Comportamento esperado

- `harness run <task> --tool gemini` executa `gemini --output-format stream-json` em modo não
  interativo (stdin não-TTY), com o prompt **pelo stdin**, dentro da worktree da task.
- Permissões: `--approval-mode auto_edit` por padrão (edições liberadas; o resto segue a política da
  tool); `--approval-mode yolo` só com `--unsafe`.
- Eventos (conferidos no código do Gemini CLI): `init` {session_id, model} → `run.started`;
  `message` {role, content, delta} → `agent.message` (pedaços `delta` do assistente acumulados e
  gravados como uma mensagem); `tool_use` {tool_name, tool_id, parameters} → `agent.tool_call`
  (+ `agent.file_changed` para `write_file`/`replace`); `tool_result` {tool_id, status, output,
  error} → `agent.tool_result`; `error` {severity, message} → `agent.error`; `result` {status,
  stats {total_tokens, input_tokens, output_tokens, cached}} → `agent.usage` (medido) + desfecho.
- Gemini não reporta custo em USD → `cost_usd` nulo (limite em USD não se aplica; tokens sim).
- Exit codes do Gemini (1, 42, 53) aparecem no erro do run.

## Critérios de aceitação

- [ ] AC-1 — `--tool gemini` disponível em `run`, `run --batch` e na ajuda; tool ausente → erro com instrução de instalação.
- [ ] AC-2 — Normalização dos 6 tipos de evento com `native` preservado; deltas do assistente acumulados.
- [ ] AC-3 — Uso medido de tokens a partir de `result.stats`; custo nulo; `result.status: error` → run `failed`.
- [ ] AC-4 — `auto_edit` por padrão e `yolo` só com `--unsafe`; `--permission-mode` continua exclusivo do Claude.
- [ ] AC-5 — Testes com runtime falso; zero dependências novas.

## Fora de escopo

- Retomada de sessão (`--resume`).
- Uso parcial durante o run (Gemini só reporta no `result`).
