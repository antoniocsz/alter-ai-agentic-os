# Task: harness.json — configuração declarativa por projeto (Fase 1)
## Agente: `coordinator` (nova capacidade do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/config.js`
- `scripts/harness/src/check.js`
- `scripts/harness/tests/config.test.js`
- `scripts/harness/templates/project/harness.json`
## Depende de: [x] 22-registry-comandos.md
## Contexto para ler: plano v0.3 (harness.json, perfis, gates)
## Skills a carregar: codegen.md
## O que já existe:
- WIP era lido de `.harness/kanban.json`; perfis/gates ainda não existem.
- `check` valida pipeline/escopos/seções/módulos.
## O que criar:
- `lib/config.js`: `readConfig(root)` (null se ausente), `resolveConfig(root)` (defaults + merge),
  `validateConfig(cfg)` (perfil válido, listas de gates, git.model, wip numérico).
- `templates/project/harness.json` com defaults do perfil `web`.
- `check` valida o harness.json quando presente (erros prefixados `[harness.json]`).
## Especificação:
- Perfis aceitos: web, api, cli, script, game, docs, design, bare.
- `git.model`: trunk | gitflow (default trunk); `featureBranch` boolean.
- Gates ainda são declarativos nesta fase (motor na Fase 4) — não alterar o finish.
- Projetos sem harness.json continuam válidos (legado).
## Critério de conclusão:
- [ ] `harness.json` gerado pelo `harness init`
- [ ] `check` reprova config inválida e aceita ausente
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 23-harness-json.md --handoff "<resumo>"`
## Complexidade: baixa/média

## Baseline (git)
- scripts/harness/src/check.js
- scripts/harness/src/lib/config.js
- scripts/harness/templates/project/harness.json
- scripts/harness/tests/config.test.js
- tasks/queue/23-harness-json.md
