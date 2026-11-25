# AlterAI - Agentic OS — app desktop

App Electron sobre a API local do `harness serve`: abre a pasta de um projeto do harness, sobe o
servidor do projeto e mostra o **board**, a **vista Execução** (rodar/parar agentes, fluxos,
competições, timeline ao vivo) e o **Analytics** numa janela.

## Rodar em desenvolvimento

```bash
cd apps/desktop
npm install                 # electron + electron-builder (só neste app; o harness segue sem dependências)
npm start                   # abre o último projeto (ou pede a pasta)
npm start -- D:\projetos\meu-projeto
```

## Gerar o instalador

```bash
npm run dist:win            # NSIS (.exe) em apps/desktop/dist/
npm run dist:mac            # .dmg
npm run dist:linux          # AppImage
```

O instalador leva o CLI do harness (`scripts/harness`, sem os testes) em `resources/harness/`.

## Como funciona

- O app roda o harness com o Node embutido no Electron (`ELECTRON_RUN_AS_NODE=1`) — não precisa de
  Node instalado. Para usar outro Node (≥ 22.5): `HARNESS_NODE=C:\caminho\node.exe`. Para outro
  CLI do harness: `HARNESS_BIN=<caminho>/scripts/harness/bin/harness.js`.
- Sobe `harness serve --port 0 --host 127.0.0.1` na pasta do projeto, lê `url` e `token` do
  `.harness/serve.json` e carrega o painel. Ao fechar, pede `POST /api/shutdown` (encerramento
  gracioso, inclusive no Windows) e espera o servidor sair.
- **Servidor → Liberar unsafe neste projeto** reinicia o serve com `--allow-unsafe` (pede
  confirmação; fica salvo por projeto).
- Janela isolada (`contextIsolation`, `sandbox`, sem Node na página); só a origem do serve navega
  dentro dela — links externos abrem no navegador.
- Configurações (recentes, unsafe por projeto, tamanho da janela) em `settings.json` na pasta de
  dados do app.
- As ferramentas de agente (Claude Code, Codex, OpenCode, Gemini CLI) são procuradas no PATH do
  sistema, como no terminal.

## Atalhos

`Ctrl/Cmd+O` abrir projeto · `Ctrl/Cmd+1` board · `Ctrl/Cmd+2` execução · `Ctrl/Cmd+3` analytics.
