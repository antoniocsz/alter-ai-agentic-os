# Task: init --dry-run (Fase 2)
## Agente: `coordinator` (ergonomia do CLI)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/init.js`
- `scripts/harness/tests/init.test.js`
## Depende de: [x] 26-spec-driven.md
## Contexto para ler: plano v0.3 (F2: init --profile, --dry-run)
## Skills a carregar: —
## O que já existe:
- `init --profile` cria o projeto; sem modo de simulação.
## O que criar:
- `init <dir> --dry-run`: valida perfil/alvo e mostra o que seria gerado, sem escrever nada.
## Especificação:
- Não cria diretório nem arquivos.
- Mostra perfil + contagem de arquivos da base e do perfil.
- Mantém validações (`--prisma` por perfil, dir não vazio).
## Critério de conclusão:
- [ ] `--dry-run` não altera o disco
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 27-init-dry-run.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- scripts/harness/src/init.js
- scripts/harness/tests/init.test.js
- tasks/queue/27-init-dry-run.md
