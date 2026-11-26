# Spec: projetos-e-inicio

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: projetos-e-inicio`.
> Criada em 2026-11-26.

## Problema

No app, o Workspace fica vazio quando o projeto não tem task ativa (ex.: harness com 135 feitas e
fila vazia) e trocar de projeto só pelo menu Arquivo → Recentes. Falta saber qual projeto está
aberto, trocar com um clique entre os projetos do workspace e ver o status do projeto.

## Comportamento esperado

- Seletor no topo do Workspace (`Ctrl P`): projetos do workspace (`.harness-workspace.json`) com
  tasks ativas/na fila, recentes do app e "Abrir outra pasta…"; no app a troca é direta (ponte
  `preload` com origem conferida), no navegador copia o `harness serve` da outra pasta.
- `GET /api/projects`: projeto atual + projetos do workspace com contagem de tasks.
- Tela Início do projeto: contagens (ativas, fila, feitas), atividade recente (handoffs), uso dos
  agentes (custo, sucesso), "O que vamos construir?" (criar task ou planejar com o coordenador).

## Critérios de aceitação

- [ ] AC-1 — `listProjects` lista os projetos do workspace (caminho com `\` ou `/`), marca o atual, conta tasks e sinaliza pasta ausente.
- [ ] AC-2 — `GET /api/projects` no `harness serve`; seletor no Workspace com filtro e teclado.
- [ ] AC-3 — app desktop: ponte `harnessDesktop` (abrir projeto, escolher pasta, recentes) só para a página do serve e só para pasta de projeto.
- [ ] AC-4 — tela Início com contagens, atividade recente e uso dos agentes; abre sozinha quando não há task ativa.
- [ ] AC-5 — criar task pela tela Início (fila) e planejar uma feature com o coordenador.

## Fora de escopo

- Criar/registrar projeto novo no workspace pelo app.
- Rodar agentes em vários projetos ao mesmo tempo na mesma janela.
