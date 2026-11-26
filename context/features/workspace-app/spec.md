# Spec: workspace-app

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: workspace-app`.
> Criada em 2026-11-26.

## Problema

O app e o `harness serve` mostram cartões por task com muitos botões soltos; não há onde
conversar com o agente nem ver o que mudou na worktree. O layout aprovado no canvas
(Workspace, inspirado em T3 Code / Codex app / Conductor) resolve isso.

## Comportamento esperado

- `GET /workspace`: barra lateral por estado (precisa de você, rodando, paradas, fila), conversa da
  task no centro (mensagens, ações recolhíveis, erros, custo) com caixa de mensagem
  (Continuar / Nova execução / Fluxo, Enter envia, Esc para) e painel Mudanças / Gates / Execução.
- `GET /api/changes?task=` lista os arquivos alterados na worktree × base (commits + não
  commitado + novos); `&file=` devolve o patch daquele arquivo (recusa arquivo fora da lista).
- `POST /api/runs` aceita `note` (instruções do humano num run novo → prompt + `user.message`).
- `/api/runtimes` informa `supports_resume`; o app desktop abre no Workspace.

## Critérios de aceitação

- [x] AC-1 — `/workspace` servido com config de controle (token) no `harness serve` e só leitura sem ele; JS do cliente válido.
- [x] AC-2 — `/api/changes` lista mudanças (modificado/novo/removido, +/−) e devolve patch por arquivo; caminho fora da lista → 404.
- [x] AC-3 — `note` num run novo vai ao prompt e abre a timeline com `user.message`.
- [x] AC-4 — app desktop abre em `/workspace`; atalhos Workspace/Quadro/Analytics/Canvas.

## Fora de escopo

- Modo Analisar (achados nas linhas), competição lado a lado e Início (próximas tasks).
- Concluir a task pelo painel (continua no terminal: `harness worktree finish`).

## Estado

- 2026-11-26 — task 140: Workspace implementado e testado (API + navegador headless com agente falso). App Electron ainda não executado no Windows.
