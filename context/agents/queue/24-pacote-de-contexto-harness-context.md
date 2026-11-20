# Task: Pacote de contexto (harness context)
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/context.js`
- `scripts/harness/src/context.js`
- `scripts/harness/tests/context.test.js`
## Depende de: [ ] `20-barramento-de-eventos-normalizado.md`
## Contexto para ler: ARCHITECTURE.md (seção 4.4), ADR-006
## Skills a carregar: codegen.md + backend.md
## O que já existe: tasks com `## Escopo`, `## Contexto para ler`, `## Skills a carregar`; `context/modules/<m>/`; ADRs.
## O que criar:
- `lib/context.js` → `buildContextPackage(root, task, { budgetTokens })` retornando seções ordenadas por prioridade, cada uma com `tokensEstimated`
- `src/context.js` → `harness context <task> [--budget <n>] [--json | --out <arquivo>]`
## Especificação:
- Seções, nesta prioridade: task completa → regras inegociáveis e guard rails do AGENTS.md → `context.md`/`status.md` do módulo → arquivos de `## Skills a carregar` → ADRs citados → lista dos arquivos do escopo (caminho + tamanho, sem conteúdo) → últimos commits que tocaram o escopo.
- Estimativa de tokens = caracteres/4, sempre rotulada como **estimada**.
- Com `--budget`, corta seções de menor prioridade e lista o que ficou de fora.
- Emite `context.built` em `events` com totais.
## Critério de conclusão:
- [ ] Pacote contém as seções na ordem definida (teste)
- [ ] `--budget` corta por prioridade e reporta o que foi omitido (teste)
- [ ] Saída marca tokens como estimados (teste)
- [ ] `pnpm test` 100% e `pnpm harness check` limpo
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 24-pacote-de-contexto-harness-context.md`
## Complexidade: média
