# Task: runner validacao real windows
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/run.js`
- `scripts/harness/tests/run-codex-opencode.test.js`
- `scripts/harness/tests/fixtures/runtimes/fake-claude.js`
- `scripts/harness/tests/fixtures/runtimes/opencode/real-pwd-error.jsonl`
## Depende de: [ ] `-`
## Contexto para ler: scripts/harness/src/lib/runner.js · D:\projetos\.tmp\validacao-runtimes\ (2ª rodada: claude ok, opencode falhou)
## Skills a carregar: codegen.md
## O que já existe: 2ª validação real (Windows, Git Bash): claude completou (src/hello.js criado, 224861/1945 tokens, $0.19 medido). opencode 2.2.5 falhou em 1s com `Failed to change directory to /d/projetos`: o filho herda `PWD` do Git Bash (diretório de quem chamou) e o opencode usa `PWD` em vez do cwd. O motivo gravado foi o genérico "opencode saiu com código 1". Node 22 emite DEP0190 por usar shell:true com array de args (.cmd no Windows). O agente (claude) ainda tentou mover a task para done/.
## O que criar:
- `lib/runner.js` → env do filho com `PWD` = cwd; exit ≠ 0 usa o último agent.error quando não há stderr; com shell:true monta a linha de comando (args já validados) → sem DEP0190
- `run.js` → prompt: não mover arquivos de tasks/
- `tests/fixtures/runtimes/fake-claude.js` → FAKE_LOG registra PWD
- `tests/fixtures/runtimes/opencode/real-pwd-error.jsonl` (NOVO) → saída real
- `tests/run-codex-opencode.test.js` → testes
## Especificação: ver O que já existe.
## Critério de conclusão:
- [x] Filho recebe PWD = cwd mesmo com PWD diferente no env do harness
- [x] Saída real do opencode: run failed com "opencode: Failed to change directory…"
- [x] Prompt proíbe mover arquivos de tasks/
- [x] Suítes de run verdes; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 113`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/113-runner-validacao-real-windows.md
