# Spec: api-local

> Fonte da verdade da feature. Task(s) referenciam esta spec via `## Feature: api-local`.
> Criada em 2026-11-24.

## Problema

Hoje os agentes só são disparados pelo terminal (`harness run`). O canvas (`/canvas`) mostra o
run mais recente de cada task, mas é só leitura: não dá para iniciar nem parar uma execução, nem
acompanhar a timeline de eventos ao vivo. Não existe uma API local para outras interfaces (o app
desktop previsto) controlarem as execuções.

## Comportamento esperado

- `harness serve` expõe uma **API local de execuções** no mesmo processo (kanban + rotinas):
  - `GET  /api/runtimes` — tools de agente instaladas (mesmos dados de `harness runtimes`).
  - `GET  /api/runs?task=&batch=&limit=` — runs recentes.
  - `GET  /api/runs/:id?after=<seq>` — run + eventos normalizados depois de `seq` (polling incremental).
  - `POST /api/runs` `{ task, tool, model?, permissionMode?, unsafe?, ignoreBudget?, contextBudget? }`
    — dispara o agente na worktree da task, com as MESMAS regras do `harness run` (task ativa, com
    worktree, orçamento, opencode exige unsafe, pacote de contexto). Responde 202 com o run.
  - `POST /api/runs/:id/stop` — interrompe o run (mata a árvore de processos).
- **Segurança**: bind 127.0.0.1 por padrão; toda rota que dispara/para exige o header
  `X-Harness-Token` com o token da sessão do serve (gerado a cada start), origem igual ao host e
  `Host` permitido (anti DNS-rebinding). `unsafe` só é aceito se o serve subiu com `--allow-unsafe`.
  Um run por task por vez (409 se já houver um rodando).
- **Descoberta**: ao subir, o serve grava `.harness/serve.json` `{ url, pid, token, started_at }`
  (removido ao encerrar) — é como o CLI e o app desktop encontram a API.
- **Canvas interativo** (`/canvas` no `harness serve`): por cartão, botão "▶ Rodar" (escolhe tool
  instalada, modelo, opções) e "■ Parar" quando há run ativo; timeline do run ao vivo no modal.
  Task sem worktree mostra o comando para criá-la. No `harness kanban --serve` o canvas segue só
  leitura.

## Critérios de aceitação

- [ ] AC-1 — `GET /api/runtimes`, `GET /api/runs`, `GET /api/runs/:id?after=` respondem JSON com os dados do banco.
- [ ] AC-2 — `POST /api/runs` dispara o agente com as mesmas validações do `harness run` (erros viram 4xx com a mensagem); 202 com o id do run.
- [ ] AC-3 — `POST /api/runs/:id/stop` interrompe um run em andamento (status `failed`, motivo `interrupted`).
- [ ] AC-4 — POSTs sem token válido → 401; origem cruzada → 403; Host fora da lista → 403; `unsafe` sem `--allow-unsafe` → 403; run já ativo na task → 409.
- [ ] AC-5 — `.harness/serve.json` gravado no start e removido no stop.
- [ ] AC-6 — Canvas do `harness serve` tem Rodar/Parar por cartão e timeline ao vivo; `kanban --serve` continua só leitura.
- [ ] AC-7 — Zero dependências novas; testes com runtime falso.

## Fora de escopo

- Autenticação multiusuário / acesso remoto (a API é local).
- Lote (`--batch`) pelo canvas.
- Streaming por SSE/WebSocket (polling incremental basta para v1).
