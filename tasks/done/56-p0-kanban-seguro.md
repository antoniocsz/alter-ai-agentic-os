# Task: P0 — Kanban seguro (bind/id/erros/CSRF) (Sprint 0)
## Agente: `coordinator` (segurança)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/kanban.js`
- `scripts/harness/tests/kanban.test.js`
- `scripts/harness/src/commands/index.js`
- `README.md`
## Depende de: [ ] 55-p0-segredos.md
## O que criar:
- Bind padrão `127.0.0.1` (`--host` explícito), validação de id de task, try/catch em todos os handlers, checagem de Origin/content-type, limite de body e handler de erro do servidor.
## Critério de conclusão:
- [ ] `GET /api/tasks/%/detail` responde 400 e não derruba o servidor
- [ ] traversal `..%2F` é rejeitado
- [ ] bind local por padrão
## Complexidade: alta
