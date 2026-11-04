# Task: Ignorar tsbuildinfo no template
## Agente: `coordinator`
## Módulo: `harness`
## Prioridade: P2
## Tipo: chore
## Escopo:
- `scripts/harness/templates/project/_base/.gitignore`
## Depende de: [x] 78-normalizar-tasks.md
## Critério de conclusão:
- [ ] `*.tsbuildinfo` ignorado em projetos novos
## Ao terminar: rodar `pnpm harness finish 79-gitignore-tsbuildinfo.md --handoff "<resumo>"`

## Baseline (git)
- tasks/queue/79-gitignore-tsbuildinfo.md
