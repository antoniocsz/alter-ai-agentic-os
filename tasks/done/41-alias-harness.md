# Task: Wrappers `harness` + PATH do usuário (ergonomia)
## Agente: `coordinator` (ergonomia)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `bin/harness`
- `bin/harness.cmd`
- `README.md`
## Depende de: [x] 40-doc-workspace-layout.md
## Contexto para ler: uso diário a partir de D:\projetos e dos projetos
## Skills a carregar: —
## O que criar:
- Wrappers em `harness/bin/` (bash + Windows cmd) que chamam `scripts/harness/bin/harness.js`.
- Adicionar `harness/bin` ao PATH do usuário (Windows) e ao `~/.bashrc` (git bash).
- Documentar no README como usar `harness <cmd>` de qualquer lugar.
## Critério de conclusão:
- [ ] `harness version` funciona via wrapper (bash e cmd)
- [ ] PATH persistido no usuário
- [ ] README documenta
## Ao terminar: rodar `pnpm harness finish 41-alias-harness.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- bin/harness
- bin/harness.cmd
- tasks/queue/41-alias-harness.md
