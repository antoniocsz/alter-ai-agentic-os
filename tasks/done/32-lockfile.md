# Task: Lockfile do pipeline + operações atômicas (Fase 8 🔴)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/lock.js`
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/lib/worktree.js`
- `scripts/harness/src/check.js`
- `scripts/harness/tests/lock.test.js`
- `README.md`
## Depende de: [x] 31-adaptadores-tool.md
## Contexto para ler: plano v0.3 (F8 alto impacto: concorrência, merge queue)
## Skills a carregar: codegen.md
## O que já existe:
- start/finish/requeue/reopen e worktree operam direto nos arquivos (sem lock).
- File moves + SQLite podem competir com N agentes.
## O que criar:
- `lib/lock.js`: lock em `.harness/lock` com timeout, detecção de lock obsoleto e reentrância no mesmo processo.
- Envolver start/finish/requeue/reopen/startWorktree/finishWorktree em `withLock`.
- `check` detecta lock órfão (mais velho que o limite) e reporta.
## Especificação:
- Lock reentrante por PID (finishWorktree → finishTask não pode dar deadlock).
- Lock obsoleto (> gate.lockStaleMs, default 60s) é removido automaticamente na aquisição.
- Timeout padrão 10s com erro claro ("pipeline ocupado; verifique `.harness/lock`").
- Serialização do merge: `worktree finish` já faz rebase → gates → squash merge sob o mesmo lock,
  servindo como merge queue (uma finalização por vez).
## Critério de conclusão:
- [ ] lock cria/libera e limpa obsoleto
- [ ] pipeline continua verde com o lock
- [ ] check reporta lock órfão
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 32-lockfile.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- scripts/harness/src/check.js
- scripts/harness/src/lib/pipeline.js
- scripts/harness/src/lib/worktree.js
- scripts/harness/src/lib/lock.js
- scripts/harness/tests/lock.test.js
- tasks/queue/32-lockfile.md
