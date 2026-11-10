# Plano: rotinas

> Decisões técnicas da feature (derivado da spec). Criado em 2026-11-09.

## Abordagem

- **Zero deps:** agendador próprio em `scripts/harness/src/routines.js` — parser de `every` (`15m`/`1h`/`daily@HH:MM`/`weekly@<dia>@HH:MM`), cálculo de próxima execução e loop com `setTimeout` (não `cron` de lib); fuso local do host (uso a lib/dates.js existente para formatação).
- **Criação de task:** a task.js (`task(args)`) é acoplada a args de CLI → extrair a parte de criação (path, título → arquivo, escopo, prioridade, tipo, agent, feature) em função interna exportada p/ reuso pelo agendador (sem mudar comportamento do comando).
- **Servidor:** `scripts/harness/src/serve.js` (novo) monta um `http.createServer` que despacha para os handlers do kanban (serveBoard existente) + rota `POST /webhook/routines/:id` (token) + payload `/api/routines` (p/ painel da 88). Registro do comando `serve` em `commands/index.js`.
- **Token:** arquivo `.harness/` é gitignored (regras do runbook); token criado com `crypto.randomUUID` na 1ª execução do serve; comparado em tempo const.
- **Dedupe:** busca por título (normalização idêntica à do `harness task`) em queue/active/done? — dedupe considera apenas queue/active (re-seasonal tasks em done são legítimas).
- **Eventos:** via helpers existentes de db/interações (mesma trilha que `harness log`), kinds: `system`.

## Módulos e arquivos afetados

- `scripts/harness/src/routines.js` — novo (schema + scheduler + criação via task refatorada)
- `scripts/harness/src/task.js` — extrair criação de task p/ reuso (comportamento do comando preservado)
- `scripts/harness/src/serve.js` — novo (serve integrado: kanban + scheduler + webhook)
- `scripts/harness/src/kanban.js` — exponso do despachante/handlers p/ serve.js + rota webhook/api-routines
- `scripts/harness/src/commands/index.js` — registro do comando `serve`
- `scripts/harness/tests/routines.test.js`, `tests/serve.test.js` — novos

## Ordem de tasks

1. `82-backend-rotinas-core.md` — schema, parser, scheduler, criação de task, dedupe, eventos + testes. depende de: —
2. `86-backend-serve-webhook.md` — serve integrado, webhook, token, registro CLI. depende de: 1 (e conclui após 85, por deadlock de `kanban.js`)
3. `88-backend-rotinas-ui.md` — painel de rotinas no board. depende de: 2

**Nota de sequenciamento:** tasks que tocam `kanban.js` (84, 85, 86, 88) rodam cada uma em lote próprio (arquivo é o conflito).

## Riscos

- Refactor de task.js mudar comportamento legado → testes do comando `task` cobrem regressão (existe base em tests/? se não, cobrir ao extrair).
- Horários após meia-noite / fuso (`daily@23:59`) → tabela de casos nos testes do parser.
- Webhook exposto fora da máquina → bind 127.0.0.1 default obrigatório; `--host` explícito sobe warning impresso.
- routines.json contendo scope com paths fora do repo → validação de paths relativos + aviso.
