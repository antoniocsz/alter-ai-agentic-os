# Plano: iniciador-app

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-28.

## Abordagem

- `apps/desktop/src/shortcut.js` (NOVO): builders puros + `main()` (PowerShell WScript.Shell no Windows).
- `apps/desktop/build/icon.{ico,png}` (NOVOS); `package.json`: script `atalho`, ícones e NSIS.
- `main.js`: ícone da janela. README raiz e do app.

## Ordem de tasks

1. `144` — iniciador do app + README. depende de: 143

## Riscos

- O atalho aponta para o Electron do `node_modules`: mover a pasta exige rodar `npm run atalho` de novo.
