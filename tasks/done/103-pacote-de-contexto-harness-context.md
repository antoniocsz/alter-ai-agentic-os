# Task: pacote de contexto harness context
## Agente: `backend`
## Módulo: `harness`
## Feature: pacote-de-contexto
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/context.js`
- `scripts/harness/src/context.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/context.test.js`
## Depende de: [ ] `-`
## Contexto para ler: context/features/pacote-de-contexto/spec.md · plan.md · scripts/harness/src/lib/memory.js (recall/lastHandoff) · scripts/harness/src/lib/tasks.js (parseTask)
## Skills a carregar: codegen.md
## O que já existe: `parseTask` (sections/values/scope), `tryOpenDb` + `interactions` com `handoff:` por task, `redact`, `recall` (busca livre — não reaproveitada aqui). NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `lib/context.js` (NOVO) → `buildContextPackage(root, task, { budget })`, `renderContextMarkdown(pkg)`, `estimateTokens(text)`
- `src/context.js` (NOVO) → `harness context <task> [--budget n] [--json | --out arquivo]`
- `commands/index.js` → registro + ajuda
- `tests/context.test.js` (NOVO)
## Especificação: ver spec AC-1..AC-5, AC-7. Seções na ordem: task, regras, feature, módulo (context.md + 3 últimos handoffs), dependências, skills, ADRs, escopo, histórico. Task aceita em queue/, active/ ou done/.
## Critério de conclusão:
- [ ] Teste: projeto fixture com feature, módulo, skill, ADR, dependência com handoff → seções na ordem e conteúdo esperado
- [ ] Teste: só os 3 últimos handoffs do status.md
- [ ] Teste: --budget corta por prioridade e lista omitidas; task nunca sai
- [ ] Teste: sem banco/sem git → seções dependentes somem sem erro; segredo redigido
- [ ] Teste: CLI --json e --out
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 103`
## Complexidade: média
