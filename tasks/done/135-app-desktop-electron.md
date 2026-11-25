# Task: app desktop electron
## Agente: `frontend`
## Módulo: `harness`
## Feature: app-desktop
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `apps/desktop/package.json`
- `apps/desktop/README.md`
- `apps/desktop/src/core.js`
- `apps/desktop/src/main.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/serve.js`
- `scripts/harness/tests/desktop-core.test.js`
## Depende de: —
## Contexto para ler: context/features/app-desktop/spec.md · plan.md · scripts/harness/src/serve.js
## Skills a carregar: codegen.md + frontend.md + security.md
## O que já existe: API local (serve.json, token), canvas interativo, analytics.
## O que criar:
- `apps/desktop/` (NOVO) → app Electron (core.js testável, main.js, package.json com electron-builder, README)
- `lib/runs-api.js`, `serve.js` → `POST /api/shutdown`
- `tests/desktop-core.test.js` (NOVO)
## Especificação: ver spec e plan. Dependências (electron, electron-builder) aprovadas pelo usuário em 2026-11-25, só em apps/desktop.
## Critério de conclusão:
- [x] Núcleo testado; serve real sobe e encerra com graça por /api/shutdown
- [x] main.js compila; package.json com empacotamento do CLI
- [x] Suíte completa verde; `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 135`
## Complexidade: alta

## Baseline (git)
- context/features/app-desktop/plan.md
- context/features/app-desktop/spec.md
- tasks/queue/135-app-desktop-electron.md
