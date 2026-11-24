# Task: runtimes deteccao e captura bruta
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: feat
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/runtimes.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/run.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/runtimes.test.js`
## Depende de: [ ] `-`
## Contexto para ler: scripts/harness/src/run.js (DRIVERS) · scripts/harness/src/lib/runner.js (resolveExecutable, toolVersion, runTool)
## Skills a carregar: codegen.md + security.md
## O que já existe: 4 drivers (claude/codex/opencode/gemini) validados só com transcrições sintéticas; `resolveExecutable` e `toolVersion` no runner. Falta (a) ver quais tools estão instaladas e (b) guardar a saída bruta para comparar com o formato real. NÃO rodar via `pnpm harness` nesta máquina; zero deps.
## O que criar:
- `src/runtimes.js` (NOVO) → `harness runtimes [--json]`: por driver, instalado?, caminho, versão, comando que o harness executa, permissões padrão
- `lib/runner.js` → `runTool({ rawLog })`: cada linha de stdout (e o stderr) gravada sem alteração no arquivo
- `run.js` → `--raw <arquivo>` no run único
- `commands/index.js` → registro + ajuda
- `tests/runtimes.test.js` (NOVO)
## Especificação: a captura bruta não passa por redaction (é para diagnóstico local; avisar na ajuda e na saída que pode conter segredos). `--raw` não vale no lote.
## Critério de conclusão:
- [ ] Teste: `harness runtimes --json` detecta tool falsa instalada e ausentes
- [ ] Teste: `--raw` grava as linhas exatamente como a tool emitiu (incl. não-JSON) e o stderr
- [ ] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 111`
## Complexidade: média

## Baseline (git)
- tasks/queue/111-runtimes-deteccao-e-captura-bruta.md
