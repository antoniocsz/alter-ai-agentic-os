# Task: Sprint 2 — qualidade interna
## Agente: `coordinator` | Módulo: `harness` | Prioridade: P2 | Tipo: refactor
## Escopo:
- `scripts/harness/tests/helpers.js`
- `scripts/harness/tests/tasks.test.js`
- `scripts/harness/src/lib/`
- `scripts/harness/src/commands/index.js`
## Depende de: [ ] 75-docs-changelog-status.md
## O que corrigir:
- Limpar projetos temporários dos testes (after/finally) — regra de temporários.
- Unificar `isGitRepo`, `norm`, `slugify`, `PROFILES`; remover dead code e linha duplicada do `version`.
- `parseTask`: BOM e CRLF; `render` não apagar placeholder desconhecido silenciosamente.
## Critério de conclusão:
- [ ] suíte sem lixo em %TEMP%; duplicações removidas; testes verdes
