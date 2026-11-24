# Task: docs runtime gemini
## Agente: `backend`
## Módulo: `harness`
## Feature: runtime-gemini
## Prioridade: P3
## Tipo: docs
## ACs: AC-1, AC-2, AC-3, AC-4
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `scripts/harness/src/commands/index.js`
- `context/features/runtime-gemini/spec.md`
## Depende de: [ ] `109`
## Contexto para ler: context/features/runtime-gemini/spec.md · handoff 109
## Skills a carregar: —
## O que já existe: `--tool gemini` (109) sem documentação.
## O que criar:
- README: tabela de tools do `harness run` + linha do CLI
- AGENTS.md: permissões do gemini
- ajuda do CLI: `--tool <claude|codex|opencode|gemini>`
- spec: ACs + estado
## Especificação: documentar só o que existe e foi testado.
## Critério de conclusão:
- [ ] `harness help` mostra gemini
- [ ] Links do índice do README resolvem
- [ ] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 110`
## Complexidade: baixa
