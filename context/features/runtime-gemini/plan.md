# Plano: runtime-gemini

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-24.

## Abordagem

- `lib/runtimes/gemini.js` (novo), no contrato dos outros drivers: `id`, `bin`, `installHint`,
  `command(opts)` → `['--output-format', 'stream-json', '--approval-mode', 'auto_edit'|'yolo',
  ('--model', m)]`, `create()` com estado (buffer de deltas do assistente, descarregado quando chega
  evento de outro tipo, mensagem não-delta ou `result`).
- `run.js`: registra o driver em `DRIVERS`.
- Fixtures sintéticas no formato do código-fonte (`tests/fixtures/runtimes/gemini/`).

## Ordem de tasks

1. `109` — driver + registro + testes. depende de: —
2. `110` — docs. depende de: 109

## Riscos

- Prompt só por stdin (sem `-p`) depende do modo não-TTY — validar com a tool real; se não
  funcionar, usar `-p` com um texto fixo curto e o restante pelo stdin.
