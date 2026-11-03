# Task: Documentar layout workspace fora da raiz (doc)
## Agente: `coordinator` (doc)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
## Depende de: [x] 39-release-v03.md
## Contexto para ler: decisão do usuário (workspace em D:\projetos\workspace, kit em ../harness)
## Skills a carregar: —
## O que criar:
- Nota no README sobre `projectsDir` e `harnessSource` (kit fora da raiz do workspace).
## Critério de conclusão:
- [ ] README explica o layout com kit externo
## Ao terminar: rodar `pnpm harness finish 40-doc-workspace-layout.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- README.md
- tasks/queue/40-doc-workspace-layout.md
