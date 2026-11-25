# Spec: app-desktop

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: app-desktop`.
> Criada em 2026-11-25.

## Problema

Todo o harness é operado pelo terminal ou pelo navegador apontado para o `harness serve`. A visão
do produto é um app desktop local-first: abrir um projeto, ver e controlar os agentes numa janela,
sem subir servidor à mão.

## Comportamento esperado

- `apps/desktop`: app Electron (decisão do usuário, 2026-11-25; dependências só neste app).
- Abre a pasta de um projeto do harness (diálogo, recentes, argumento), sobe `harness serve
  --port 0` com o Node do Electron (ou `HARNESS_NODE`), descobre url/token pelo `serve.json` e
  carrega o canvas; menus para Board, Execução, Analytics, reiniciar, liberar unsafe por projeto
  (com confirmação), abrir no navegador e ver o log.
- Encerramento gracioso por `POST /api/shutdown` (token), inclusive no Windows.
- Segurança: janela isolada, navegação só na origem do serve, links externos no navegador.
- Instalador via electron-builder levando o CLI do harness.

## Critérios de aceitação

- [ ] AC-1 — Núcleo sem Electron (caminhos, Node, projeto, serve, configurações) testado.
- [ ] AC-2 — `POST /api/shutdown` com token encerra o serve com graça (exit 0, serve.json removido).
- [ ] AC-3 — App Electron com menus, recentes, unsafe por projeto, log, janela isolada.
- [ ] AC-4 — Empacotamento declarado (electron-builder, CLI do harness em resources).
- [ ] AC-5 — Harness continua sem dependências; docs.

## Fora de escopo

- Terminal embutido e editor de arquivos.
- Atualização automática e assinatura de código do instalador.
- Vários projetos abertos ao mesmo tempo.
