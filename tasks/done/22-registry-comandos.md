# Task: Trocar o dispatcher switch por registro de comandos (Fase 1)
## Agente: `coordinator` (refatoração de ergonomia do CLI)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/bin/harness.js`
- `scripts/harness/src/commands/index.js`
## Depende de: [x] 21-pipeline-tasks-dir.md
## Contexto para ler: plano v0.3 (Fase 1); `bin/harness.js` atual
## Skills a carregar: codegen.md
## O que já existe:
- `bin/harness.js` com switch gigante, imports de todos os comandos, usage inline.
- `applyProjectFlag` resolvendo `--project` e `chdir`.
## O que criar:
- `src/commands/index.js`: mapa `comando → handler` + `usage` (fonte única).
- `bin/harness.js`: parsing + `--project` + dispatch pelo mapa; sem switch.
## Especificação:
- Mesmos comandos, aliases (`--version`, `-v`, `--help`, `-h`) e comportamento.
- `init --workspace` continua delegando para `workspace init`.
- Comando desconhecido: mensagem + usage, exit 1.
## Critério de conclusão:
- [ ] `bin/harness.js` sem switch de comandos
- [ ] `pnpm test` verde
- [ ] `pnpm harness check` limpo
- [ ] `harness help` e `harness version` funcionam
## Ao terminar: rodar `pnpm harness finish 22-registry-comandos.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/bin/harness.js
- scripts/harness/src/commands/index.js
- tasks/queue/22-registry-comandos.md
