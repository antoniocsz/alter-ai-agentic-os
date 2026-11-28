# AlterAI - Agentic OS — app desktop

App Electron sobre a API local do `harness serve`: abre a pasta de um projeto do harness, sobe o
servidor do projeto e abre no **Workspace** (tasks por estado, conversa contínua com o agente,
mudanças da worktree e gates), com o **quadro**, o **Analytics** e o **canvas clássico** (fluxos,
competições) a um atalho.

## Rodar em desenvolvimento

```bash
cd apps/desktop
npm install                 # electron + electron-builder (só neste app; o harness segue sem dependências)
npm start                   # abre o último projeto (ou pede a pasta)
npm start -- D:\projetos\meu-projeto
```

## Abrir com um clique (iniciador)

```bash
npm run atalho              # depois do npm install
```

Cria o atalho **AlterAI - Agentic OS** com o ícone do app — no Windows na Área de Trabalho e no
Menu Iniciar (clique com o botão direito → *Fixar na barra de tarefas*); no Linux um `.desktop` em
`~/.local/share/applications`. O atalho abre o Electron deste app direto, **sem janela de
terminal**, no último projeto aberto. Se mover a pasta do repositório ou reinstalar as
dependências, rode `npm run atalho` de novo. No macOS, use o instalador (`npm run dist:mac`).

## Gerar o instalador

```bash
npm run dist:win            # NSIS (.exe) em apps/desktop/dist/
npm run dist:mac            # .dmg
npm run dist:linux          # AppImage
```

O instalador leva o CLI do harness (`scripts/harness`, sem os testes) em `resources/harness/`,
usa o ícone de `build/` e cria os atalhos na Área de Trabalho e no Menu Iniciar (o instalador do
Windows deixa escolher a pasta de instalação).

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

`Ctrl/Cmd+P` trocar de projeto (seletor no topo do Workspace: projetos do workspace + recentes) · `Ctrl/Cmd+O` abrir projeto · `Ctrl/Cmd+1` Workspace · `Ctrl/Cmd+2` quadro · `Ctrl/Cmd+3` analytics · `Ctrl/Cmd+4` canvas clássico.
