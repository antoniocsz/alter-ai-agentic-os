# Spec: conversa-continua

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: conversa-continua`.
> Criada em 2026-11-25.

## Problema

Cada `harness run` é avulso: o agente recebe o prompt montado, trabalha e termina. Para pedir um
ajuste é preciso abrir um run novo, sem a memória da sessão anterior. O novo layout do app
(Workspace com conversa) precisa de uma conversa contínua com o agente.

## Comportamento esperado

- `harness run <task> --continue [<run>] --message "<texto>"` retoma a sessão do agente do último
  run da task com sessão (ou do run indicado) e envia só a mensagem do humano + lembrete das regras.
- A tool retoma pela sessão que ela mesma reportou: claude `--resume <id>`, codex
  `exec … resume <id> -`, opencode `--session <id>`. Gemini: não suportado (recusa clara).
- O novo run grava `parent_run_id` e abre a timeline com o evento `user.message`.
- API local: `POST /api/runs` aceita `continue` (true | id do run) + `message`;
  `GET /api/conversation?task=` devolve os runs da task em ordem com mensagens, ações e `can_continue`.

## Critérios de aceitação

- [x] AC-1 — drivers claude/codex/opencode montam o comando de retomada; gemini declara que não suporta.
- [x] AC-2 — `run --continue` retoma a sessão do run anterior, grava `parent_run_id` e `user.message`; o prompt não repete a task.
- [x] AC-3 — recusas claras: sem run com sessão, run rodando, revisor/juiz (só leitura), run fora da worktree da task, `--tool` diferente, mensagem vazia.
- [x] AC-4 — API: `POST /api/runs` com `continue` + `message` (token obrigatório) e `GET /api/conversation`.
- [x] AC-5 — orçamento, gates pós-run e `--unsafe` valem na continuação como num run normal.

## Fora de escopo

- Interface do Workspace/conversa no app (próximas tasks).
- Mensagens enquanto o run ainda está rodando (fila/injeção na sessão viva).
- Validação com as tools reais (feita fora, pelo script de validação).

## Estado

- 2026-11-25 — task 139: implementado e testado com agente falso (CLI e API). Validação com as tools reais pendente.
