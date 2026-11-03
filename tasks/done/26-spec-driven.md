# Task: Camada spec-driven (features/ + harness feature + --feature) (Fase 2)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/feature.js`
- `scripts/harness/src/task.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/templates/task/task.md.tpl`
- `scripts/harness/templates/feature/spec.md.tpl`
- `scripts/harness/templates/feature/plan.md.tpl`
- `scripts/harness/tests/feature.test.js`
- `.agents/feature-planning.md`
- `.agents/context-interview.md`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 25-perfis-projeto.md
## Contexto para ler: plano v0.3 (spec-driven, D7, ACs rastreáveis)
## Skills a carregar: codegen.md
## O que já existe:
- `context/features/` no template base (vazio).
- Tasks têm `## Módulo`, `## Escopo`, etc.; feature-planning gera só tasks.
## O que criar:
- `harness feature <slug>`: cria `context/features/<slug>/spec.md` + `plan.md` (recusa se já existe).
- `harness task --feature <slug>`: task carrega `## Feature: <slug>`; aviso se spec ausente.
- `check`: task com feature exige `context/features/<slug>/spec.md`.
- Docs: feature-planning passa a gerar spec antes das tasks; AGENTS.md/README citam a camada.
## Especificação:
- Slug normalizado (mesma função do task); sem espaços/acentos.
- Spec contém critérios de aceitação com IDs (`AC-1`, `AC-2`) para rastreabilidade futura.
- Sem `--feature`, comportamento atual inalterado.
## Critério de conclusão:
- [ ] `harness feature billing` cria spec+plan
- [ ] `harness task ... --feature billing` grava a seção
- [ ] check reprova task com feature sem spec
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 26-spec-driven.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- .agents/context-interview.md
- .agents/feature-planning.md
- AGENTS.md
- README.md
- scripts/harness/src/check.js
- scripts/harness/src/commands/index.js
- scripts/harness/src/task.js
- scripts/harness/templates/task/task.md.tpl
- scripts/harness/src/feature.js
- scripts/harness/templates/feature/plan.md.tpl
- scripts/harness/templates/feature/spec.md.tpl
- scripts/harness/tests/feature.test.js
- tasks/queue/26-spec-driven.md
