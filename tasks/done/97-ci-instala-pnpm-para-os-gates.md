# Task: ci instala pnpm para os gates
## Agente: `backend`
## Módulo: `harness`
## Feature: —
## Prioridade: P1
## Tipo: ci
## ACs: —
## Escopo (arquivos que esta task vai tocar):
- `.github/workflows/ci.yml`
## Depende de: [ ] `-`
## Contexto para ler: .github/workflows/ci.yml · scripts/harness/src/lib/gates.js (gates `test`/`test:affected` chamam `pnpm run test`) · run 44952567913 do GitHub Actions
## Skills a carregar: infra.md
## O que já existe: job `test` do CI usa só `actions/setup-node@v4` (sem pnpm). Os gates chamam `pnpm run test`, então 4 testes falham no CI (gates pnpm-lock; worktree finish; 2 em pipeline-cross) — run 44952567913, primeiro push dos commits 20–94. Reproduzido localmente: sem pnpm no PATH falha, com pnpm passa.
## O que criar:
- `.github/workflows/ci.yml` → `pnpm/action-setup@v6` (pnpm 10; a v4 roda em Node 20) antes do `setup-node` nos dois jobs; `actions/checkout` e `actions/setup-node` em v5 (as v4 rodam em Node 20, depreciado nos runners)
## Especificação: nenhum teste é alterado nem pulado — o produto depende de pnpm nos gates e o CI passa a refletir isso. Node 22 continua (mínimo do harness).
## Critério de conclusão:
- [ ] YAML válido
- [ ] Push no GitHub: workflow CI verde (jobs `test` e `smoke-init`)
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 97`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/97-ci-instala-pnpm-para-os-gates.md
