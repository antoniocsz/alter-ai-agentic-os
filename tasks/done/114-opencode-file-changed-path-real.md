# Task: opencode file changed path real
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P2
## Tipo: fix
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/runtimes/opencode.js`
- `scripts/harness/tests/run-codex-opencode.test.js`
- `scripts/harness/tests/fixtures/runtimes/opencode/real-write.jsonl`
## Depende de: [ ] `-`
## Contexto para ler: scripts/harness/src/lib/runtimes/opencode.js · D:\projetos\.tmp\validacao-runtimes\opencode-raw.jsonl
## Skills a carregar: codegen.md
## O que já existe: 3ª validação real: opencode 2.2.5 completou (src/hello.js criado, 114237/1213 tokens, custo 0 reportado pela tool). O `write` real usa `state.input.path` (não `filePath`), então nenhum agent.file_changed foi emitido.
## O que criar:
- `lib/runtimes/opencode.js` → aceita `input.path`
- `tests/fixtures/runtimes/opencode/real-write.jsonl` (NOVO) → linha real do write
- `tests/run-codex-opencode.test.js` → teste
## Especificação: write real → agent.file_changed { path: 'src/hello.js', tool: 'write' }.
## Critério de conclusão:
- [x] Linha real do write gera agent.file_changed
- [x] Suíte de run verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 114`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/lib/runtimes/opencode.js
- scripts/harness/tests/run-codex-opencode.test.js
- scripts/harness/tests/fixtures/runtimes/opencode/real-write.jsonl
- tasks/queue/114-opencode-file-changed-path-real.md
