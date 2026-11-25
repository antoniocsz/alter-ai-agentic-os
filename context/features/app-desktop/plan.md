# Plano: app-desktop

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-25.

## Abordagem

- `apps/desktop/src/core.js`: lógica pura (harnessEntry, nodeCommand, isHarnessProject, serveArgs,
  readServeFile/waitForServe, startServe/stopServe, ringLog, settings, isInternalUrl).
- `apps/desktop/src/main.js`: Electron (janela, menus, ciclo de vida, single instance).
- `lib/runs-api.js` + `serve.js`: `POST /api/shutdown` com o mesmo encerramento dos sinais.
- Testes em `scripts/harness/tests/desktop-core.test.js` (CI roda só node:test; Electron não é
  instalado no CI).

## Módulos e arquivos afetados

- `apps/desktop/` (novo): `package.json`, `README.md`, `src/core.js`, `src/main.js`
- `scripts/harness/src/lib/runs-api.js`, `scripts/harness/src/serve.js`, teste novo
- `README.md`

## Ordem de tasks

1. `135` — app desktop (núcleo, shutdown, Electron, empacotamento). depende de: —
2. `136` — docs. depende de: 135

## Riscos

- Electron não é exercitado no CI → núcleo isolado e testado; `main.js` com verificação de sintaxe;
  validar `npm start` no Windows.
- Node embutido do Electron 45 precisa de `node:sqlite` sem flag (Node ≥ 22.13) → `HARNESS_NODE` como saída.
