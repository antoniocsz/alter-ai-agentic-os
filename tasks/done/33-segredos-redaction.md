# Task: Segredos — redaction automática + gate secrets (Fase 8 🔴)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/redact.js`
- `scripts/harness/src/lib/gates.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/src/lib/config.js`
- `scripts/harness/templates/project/*/harness.json`
- `scripts/harness/tests/redact.test.js`
- `README.md`
## Depende de: [x] 32-lockfile.md
## Contexto para ler: plano v0.3 (F8 🔴 segredos/redaction)
## Skills a carregar: codegen.md
## O que já existe:
- Memória grava sessões/interações sem filtrar; nenhum gate de segredos.
## O que criar:
- `lib/redact.js`: mascara `sk-*`, `ghp_*`, AWS, JWT e `password/token/api_key=...`.
- Redaction em `sessionEnd`, `recordInteraction` e resultados de `recall`.
- Gate nativo `secrets`: varre o repo (texto) e falha com arquivo:linha.
- Perfis passam a incluir `secrets` em `gates.finish`; default idem.
## Especificação:
- Não mascarar demais: apenas padrões inequívocos; prefixo da chave (ex.: `password=`) é preservado.
- Scan ignora node_modules, .git, .harness, .worktrees, dist, coverage e lockfiles/binários.
- `secrets` roda no finish sem depender de node_modules.
## Critério de conclusão:
- [ ] segredo plantado reprova o gate e finish bloqueia
- [ ] sessão/interação não persistem segredo
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 33-segredos-redaction.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- scripts/harness/src/lib/config.js
- scripts/harness/src/lib/db.js
- scripts/harness/src/lib/gates.js
- scripts/harness/src/lib/memory.js
- scripts/harness/templates/project/api/harness.json
- scripts/harness/templates/project/bare/harness.json
- scripts/harness/templates/project/cli/harness.json
- scripts/harness/templates/project/design/harness.json
- scripts/harness/templates/project/docs/harness.json
- scripts/harness/templates/project/game/harness.json
- scripts/harness/templates/project/script/harness.json
- scripts/harness/templates/project/web/harness.json
- scripts/harness/src/lib/redact.js
- scripts/harness/tests/redact.test.js
- tasks/queue/33-segredos-redaction.md
