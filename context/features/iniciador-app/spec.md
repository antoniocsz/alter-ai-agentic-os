# Spec: iniciador-app

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: iniciador-app`.
> Criada em 2026-11-28.

## Problema

Abrir o app desktop exige terminal (`cd apps/desktop && npm start`), o app usa o ícone padrão do
Electron e o README não apresenta o que o projeto faz hoje (o repositório no GitHub está sem
descrição).

## Comportamento esperado

- `npm run atalho` (apps/desktop) cria o atalho "AlterAI - Agentic OS" com ícone: Windows na Área de
  Trabalho e no Menu Iniciar (.lnk → electron.exe do app, sem terminal); Linux `.desktop`; macOS
  orienta o `dist:mac`.
- Ícone do app (`build/icon.ico`, `build/icon.png`) na janela e no instalador; instalador NSIS com
  atalhos e escolha da pasta.
- README: abertura nova (o que é, o que faz, começo rápido) e seção do app atualizada.

## Critérios de aceitação

- [x] AC-1 — `windowsShortcutScript` / `linuxDesktopEntry` geram atalhos corretos (aspas, ícone, sem terminal); sem Electron instalado o comando orienta o `npm install`.
- [x] AC-2 — ícone multi-tamanho no app e no `build` do electron-builder.
- [x] AC-3 — README com a apresentação do projeto e o iniciador documentado.

## Fora de escopo

- Assinatura de código do instalador; atualização automática.
- Descrição/tópicos do repositório no GitHub (feitos pela interface do GitHub).

## Estado

- 2026-11-28 — task 144: iniciador, ícone e README prontos e testados; `npm run atalho` ainda não executado no Windows.
