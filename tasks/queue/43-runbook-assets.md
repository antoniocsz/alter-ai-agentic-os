# Task: Runbook por projeto + assets de game (Fase 8 🟡)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/project/_base/context/project/runbook.md`
- `scripts/harness/templates/project/_base/README.md`
- `scripts/harness/templates/project/game/README.md`
- `scripts/harness/templates/project/game/.gitattributes`
- `README.md`
## Depende de: [x] 42-conventional-commits.md
## Contexto para ler: F8 🟡 (runbooks/ambientes, LFS para games)
## Skills a carregar: —
## O que criar:
- `context/project/runbook.md` no template base: ambientes, deploy, rollback, migrations, backup.
- Perfil game: README com pipeline de assets e `.gitattributes` preparado para LFS.
- README do kit documenta os dois.
## Critério de conclusão:
- [ ] projeto novo nasce com runbook
- [ ] game tem instruções de LFS
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 43-runbook-assets.md --handoff "<resumo>"`
## Complexidade: baixa
