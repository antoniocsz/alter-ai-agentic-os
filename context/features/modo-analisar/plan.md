# Plano: modo-analisar

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-26.

## Abordagem

- `run.js`: papel `ask` (prompt só leitura, `opts.readOnly`, sem gates) e `--ask` no CLI; revisor
  pede itens `caminho/arquivo:linha —`.
- `runs.role` (ALTER) + `startRun({ role })`; `runTool({ role, readOnlyGuard })` com guarda da worktree.
- `lib/findings.js` (NOVO): `parseFindings`, `verdictOf`, `taskFindings`; `GET /api/findings`.
- `lib/conversation.js`: runs só leitura fora do `--continue`; `role` na conversa.
- `lib/workspace-page.html`: vista Analisar (diff com linhas, achados, comentários, perguntas, enviar).

## Módulos e arquivos afetados

- novos: `lib/findings.js`, `tests/analyze.test.js`
- `run.js`, `lib/runner.js`, `lib/runs.js`, `lib/db.js`, `lib/runs-api.js`, `lib/conversation.js`,
  `lib/workspace-page.html`; `README.md`, `AGENTS.md`

## Ordem de tasks

1. `141` — modo Analisar. depende de: 140

## Riscos

- Revisor fora do formato → achados vazios; a conversa continua mostrando a revisão inteira.
