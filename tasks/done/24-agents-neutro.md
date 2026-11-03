# Task: AGENTS.md neutro + regras de stack em referência (Fase 1)
## Agente: `coordinator` (documentação estrutural do kit)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `AGENTS.md`
- `README.md`
- `.agents/stack-ts-monorepo.md`
- `scripts/harness/tests/init.test.js`
## Depende de: [x] 23-harness-json.md
## Contexto para ler: plano v0.3 (AGENTS.md fino/neutro, perfis, D9)
## Skills a carregar: —
## O que já existe:
- AGENTS.md mistura protocolo (neutro) com regras de stack TS/monorepo (barrel, tenancy, MVVM, eventos, DI).
- README duplica parte do protocolo e do checklist.
## O que criar:
- Mover as regras de stack para `.agents/stack-ts-monorepo.md` e referenciá-las no índice.
- AGENTS.md: protocolo + guard rails + peso por perfil + índice (neutro de stack).
- Seção "Perfis e harness.json" curta no README; checklist marcado como "conforme perfil".
- Ajustar teste do init que exigia `@<escopo>` no AGENTS.md (agora vive na referência).
## Especificação:
- Não alterar comportamento do CLI.
- Perfis citados: web, api, cli, script, game, docs, design, bare (fonte: harness.json).
- A versão "fina" do AGENTS.md por projeto fica para os adaptadores (F6), quando o kit central existir.
## Critério de conclusão:
- [ ] AGENTS.md sem regras específicas de TS (barrel/MVVM/tenant) — só ponteiro
- [ ] `.agents/stack-ts-monorepo.md` contém as regras movidas
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 24-agents-neutro.md --handoff "<resumo>"`
## Complexidade: baixa

## Baseline (git)
- AGENTS.md
- README.md
- scripts/harness/tests/init.test.js
- .agents/stack-ts-monorepo.md
- tasks/queue/24-agents-neutro.md
