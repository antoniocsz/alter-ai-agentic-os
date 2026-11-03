# Task: Ciclo de vida de projeto + profile set/current (Fase 8 🟢)
## Agente: `coordinator` (workspace)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/workspace.js`
- `scripts/harness/src/profile.js`
- `scripts/harness/tests/workspace.test.js`
- `scripts/harness/tests/profile.test.js`
- `README.md`
## Depende de: [x] 49-adr-glossario.md
## Contexto para ler: F8 🟢 (ciclo de vida de projeto, troca de perfil)
## O que criar:
- `workspace remove <nome> [--delete --force]`: desregistra (ou apaga com segurança).
- `profile set <p>`: troca o perfil no harness.json (adota gates/wip do perfil, preserva git).
- `profile current`: mostra o perfil atual.
## Especificação:
- `--delete` exige `--force` e bloqueia path fora da raiz do workspace.
- `profile set` valida o perfil e preserva `git.baseBranch`.
## Critério de conclusão:
- [ ] remove/desregistra e delete seguro
- [ ] profile set/current funcionam
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 50-ciclo-vida-projeto.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- scripts/harness/src/profile.js
- scripts/harness/src/workspace.js
- scripts/harness/tests/workspace.test.js
- scripts/harness/tests/profile.test.js
- tasks/queue/50-ciclo-vida-projeto.md
