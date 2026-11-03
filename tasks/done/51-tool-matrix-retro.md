# Task: Matriz de tools + retrospectiva (Fase 8 🟢)
## Agente: `coordinator` (docs + capacidade)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `scripts/harness/src/retro.js`
- `scripts/harness/src/commands/index.js`
- `scripts/harness/tests/retro.test.js`
## Depende de: [x] 50-ciclo-vida-projeto.md
## Contexto para ler: F8 🟢 (matriz de tools, retrospectiva mensal)
## O que criar:
- Seção "Matriz de capacidades por tool" no README (OpenCode/Claude/Codex, o que se perde).
- `harness retro [--days N] [--out <arquivo>] [--force]`: gera retrospectiva markdown com
  métricas do período + sessões + placeholders de lições/ações.
## Critério de conclusão:
- [ ] retro gera arquivo com métricas e sessões; não sobrescreve sem --force
- [ ] README tem a matriz
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 51-tool-matrix-retro.md --handoff "<resumo>"`
## Complexidade: média

## Baseline (git)
- README.md
- scripts/harness/src/commands/index.js
- scripts/harness/src/retro.js
- scripts/harness/tests/retro.test.js
- tasks/queue/51-tool-matrix-retro.md
