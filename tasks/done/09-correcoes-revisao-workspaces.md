# Task: correções da revisão do lote de workspaces (P1–P4)
## Agente: `backend`
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `scripts/harness/bin/harness.js`
- `scripts/harness/src/kanban.js`
- `scripts/harness/templates/workspace/AGENTS.md`
- `context/modules/harness/context.md`
- `context/modules/harness/status.md`
- `scripts/harness/tests/workspace.test.js` (teste P2)
- `scripts/harness/tests/kanban.test.js` (teste P4)
## Depende de: [ ] `-`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: lote de workspaces concluído (task 08) — revisado e aprovado com 4 pendências menores
## O que corrigir:
- P1 — doc afirma "paths absolutos" no registro; na verdade o `saveRegistry` grava relativo e resolve absoluto na carga → alinhar docs (README, templates/workspace/AGENTS.md, context/modules/harness/context.md)
- P2 — `applyProjectFlag` (flag `--project`) roda fora do try/catch global → erro de flag exibe stack trace; envolver em try/catch com a mesma saída `erro: <msg>`
- P3 — `context/modules/harness/status.md`: checkbox `- [ ] Typecheck: [ ]` vazio sem critério (módulo é JS puro) e bloco Handoff sem conteúdo real → remover linha vazia e preencher Handoff
- P4 — `handleDetail` no kanban chama `resolveTaskId` sem try/catch; prefixo ambíguo na URL derruba o servidor → envolver e responder 400
## Critério de conclusão:
- [ ] Docs coerentes com o armazenamento do registro (relativo → absoluto em memória)
- [ ] Erro de `--project` sem stack trace (mensagem `erro: ...`)
- [ ] status.md sem checkbox vazio e com Handoff real
- [ ] `handleDetail` com prefixo ambíguo → 400 (não derruba o servidor)
- [ ] `pnpm test` passando (59+)
- [ ] `pnpm harness check` ok
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 09-correcoes-revisao-workspaces.md`
## Complexidade: baixa

## Baseline (git)
- context/agents/queue/09-correcoes-revisao-workspaces.md
## Baseline (git)
- context/agents/queue/09-correcoes-revisao-workspaces.md
