# Task: ADR lifecycle + glossário (Fase 8 🟢)
## Agente: `coordinator` (docs/estrutura)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/templates/project/_base/context/project/adr/ADR-000-template.md`
- `scripts/harness/templates/project/_base/context/project/adr/README.md`
- `scripts/harness/templates/project/_base/context/project/glossary.md`
- `scripts/harness/templates/project/_base/README.md`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 48-release-v031.md
## Contexto para ler: F8 🟢 (ADR lifecycle, glossário)
## O que criar:
- Template de ADR com ciclo de vida (proposed/accepted/superseded/deprecated) e índice `adr/README.md`.
- `context/project/glossary.md` (linguagem ubíqua) no template base.
- Protocolo: ADR novo entra como accepted; substituição marca o antigo como superseded.
## Critério de conclusão:
- [ ] projeto novo nasce com índice de ADR e glossário
- [ ] AGENTS/README explicam o ciclo
## Ao terminar: rodar `pnpm harness finish 49-adr-glossario.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- AGENTS.md
- scripts/harness/templates/project/_base/README.md
- scripts/harness/templates/project/_base/context/project/adr/ADR-000-template.md
- scripts/harness/templates/project/_base/context/project/adr/README.md
- scripts/harness/templates/project/_base/context/project/glossary.md
- tasks/queue/49-adr-glossario.md
