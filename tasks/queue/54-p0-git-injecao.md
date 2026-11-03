# Task: P0 — Git paths e execução segura (Sprint 0)
## Agente: `coordinator` (segurança)
## Módulo: `harness`
## Prioridade: P0
## Tipo: fix
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/git.js`
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/init.js`
- `scripts/harness/tests/git.test.js`
- `scripts/harness/tests/gates.test.js`
- `scripts/harness/tests/init.test.js`
## Depende de: [ ] 53-p0-escopo-integridade.md
## O que criar:
- `core.quotePath=false`/`-z` no git status e diff; preservar acentos.
- Trocar comandos shell por `execFileSync` com array; validar branch e nome de gate.
## Critério de conclusão:
- [ ] arquivo `café.ts` valida corretamente no escopo
- [ ] `init --branch "a & echo x"` falha sem executar
- [ ] gate inválido é rejeitado
## Complexidade: média
