# Spec: rotinas

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: rotinas`.
> Criada em 2026-11-09.

## Problema

O harness só produz valor quando um humano chama. Trabalho repetitivo — retro semanal, triagem de bugs recebidos por webhook, "abrir task de revisão toda segunda" — precisa disparar sem sessão: por **agenda** e por **webhook**. Inspirado no Superfik ("agentes por agenda ou webhook"), mas aderente ao guard rail do projeto: a rotina **nunca executa código por conta própria** — ela só cria tasks na queue; a execução contínua sob consentimento humano (pipeline existente).

## Comportamento esperado

- `.harness/routines.json` (gitignored, junto do banco):
  ```jsonc
  {
    "routines": [
      {
        "id": "retro-semanal",
        "every": "weekly@seg@09:00",       // ou "15m", "1h", "daily@09:00"
        "task": {
          "title": "Retro da semana",      // título normalizado vira nome do arquivo
          "module": "harness",             // opcional
          "priority": "P2",                // opcional (default P2)
          "agent": "backend",              // opcional
          "scope": ["context/project/retro/"], // opcional (repo-relative)
          "type": "docs"                   // opcional (default feat)
        },
        "dedupe": true                     // não duplica se já existir task com mesmo título na queue
      }
    ]
  }
  ```
- **`harness serve`**: um processo zero-deps que junta (1) servidor do kanban com drag&drop, (2) agendador das rotinas (leitura de routines.json, cálculo de próxima execução, disparo no horário), (3) receiver de webhook `POST /webhook/routines/<id>?token=<token>`.
- **Disparo** (por agenda ou webhook) → cria a task na queue usando a mesma lógica do `harness task` (título normalizado, scope, prioridade, tipo, agent, module) e registra evento no banco.
- **Dedupe**: com `dedupe: true`, se já existe task não-concluída com o mesmo título → skip registrado (não cria).
- **Token**: gerado na primeira execução e salvo em `.harness/webhook-token` (gitignored); request sem token → 401; token válido → 200 com resultado de criação (ou skip por dedupe).
- **Eventos**: cada disparo grava interação/evento no banco (rotina disparada / task criada / skip por dedupe / webhook recebido) — visível em `harness history`/`record`, e serve de base para o painel da task 88.
- Rotina com JSON inválido não derruba o `serve` — registra erro e ignora a rotina problemática.

## Critérios de aceitação

- [ ] AC-1 — `.harness/routines.json` é validado no load; erro de schema gera mensagem clara e não derruba o `serve` (a rotina inválida é ignorada com log).
- [ ] AC-2 — o agendador dispara no intervalo/atraso certos (`15m`, `1h`, `daily@HH:MM`, `weekly@<dia>@HH:MM`) e cria a task na queue com os metadados declarados (scope, priority, type, agent, module).
- [ ] AC-3 — com `dedupe: true` não há task duplicada na queue para o mesmo título (skip logado no banco).
- [ ] AC-4 — `POST /webhook/routines/<id>?token=<t>` dispara a rotina por id; sem token ou token errado → 401; evento de webhook gravado no banco.
- [ ] AC-5 — `harness serve` sobe kanban + agendador + webhook num único processo (portas/GC certos, bind 127.0.0.1 por padrão), com shutdown gracioso (SIGINT/SIGTERM) e comando registrado no CLI.
- [ ] AC-6 — cada disparo (agenda ou webhook) e seus resultados (task criada / skip dedupe / erro) ficam no banco como eventos/interações auditáveis.
- [ ] AC-7 — o painel do board (`harness kanban --serve`) exibe as rotinas com próxima/última execução e botão "rodar agora" (que usa o mesmo caminho do webhook internamente, confirmado por token local).

## Fora de escopo

- Rotina executando comandos arbitrários do harness ou shell — v1 só cria tasks (decisão de guard rail).
- Rotinas que spawnam agentes diretamente — a queue e o humano decidem quem executa.
- Scheduler multi-projeto/workspace (rotinas por projeto; workspace run é superfície separada).
- Persistência de cron própria além do routines.json (sem tabela nova de "jobs").
