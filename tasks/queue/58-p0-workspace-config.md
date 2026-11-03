# Task: P0 — Workspace new/add + config única (Sprint 0)
## Agente: `coordinator` (bugfix)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/lib/workspace.js`
- `scripts/harness/src/status.js`
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/tests/workspace.test.js`
- `README.md`
## Depende de: [ ] 57-p0-lock-heartbeat.md
## O que criar:
- `workspace new/add` funcionam sem cache (fallback para `harnessSource`); `new --profile/--bare`.
- `status/recall` usam `loadRegistry` (paths absolutos) de qualquer subdiretório.
- Registrar/remover a fonte da verdade de `projectsDir` (só `.harness-workspace.json`).
## Critério de conclusão:
- [ ] `workspace new smoke --profile script` funciona em D:\projetos
- [ ] `status` de `workspace/` encontra a raiz
- [ ] config duplicada removida
## Complexidade: média
