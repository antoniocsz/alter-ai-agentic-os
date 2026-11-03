# Task: P0 — Segredos: redaction e gate robustos (Sprint 0)
## Agente: `coordinator` (segurança)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/redact.js`
- `scripts/harness/tests/redact.test.js`
## Depende de: [ ] 54-p0-git-injecao.md
## O que criar:
- Reconhecer `DB_PASSWORD`, `DATABASE_URL`, `*_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `Bearer`, `.env*`.
- Não pular todo arquivo em tests/ nem qualquer nome com "lock".
## Critério de conclusão:
- [ ] `.env` com `DB_PASSWORD=...` reprova o gate e é redigido
- [ ] `blocklist.ts` com segredo é detectado
## Complexidade: média
