# Task: run anexa pacote de contexto
## Agente: `backend`
## Módulo: `harness`
## Feature: pacote-de-contexto
## Prioridade: P1
## Tipo: feat
## ACs: AC-6
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/run.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/tests/run-context.test.js`
## Depende de: [ ] `103`
## Contexto para ler: context/features/pacote-de-contexto/spec.md · scripts/harness/src/run.js (buildPrompt, runCmd, runBatchCmd) · scripts/harness/src/lib/config.js
## Skills a carregar: codegen.md
## O que já existe: `buildContextPackage`/`renderContextMarkdown` (task 103); `buildPrompt` = protocolo + task. NÃO rodar via `pnpm harness` nesta máquina — usar `node scripts/harness/bin/harness.js`; zero deps.
## O que criar:
- `run.js` → prompt = protocolo + task + pacote (padrão ligado; `--no-context`; `--context-budget n`); evento `context_built` no histórico da task
- `config.js` → `context.budget` (inteiro ≥ 0; 0 desliga) com default 8000 e validação
- `tests/run-context.test.js` (NOVO)
## Especificação: ver spec AC-6. A task já vai no prompt; o pacote anexado omite a seção `task` para não duplicar.
## Critério de conclusão:
- [ ] Teste: stdin do runtime falso contém o pacote; `--no-context` remove; `--context-budget` respeitado; `context.budget: 0` desliga
- [ ] Teste: config inválida reprovada pelo validateConfig
- [ ] Teste: lote também anexa o pacote por task
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 104`
## Complexidade: baixa
