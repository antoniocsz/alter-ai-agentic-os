# Task: tornar repo pronto para clonar e usar (onboarding T1 + genericidade T2 + confianca T3)
## Agente: `backend`
## Módulo: `packages/modules/<modulo>`
## Escopo (arquivos que esta task vai tocar):
- `AGENTS.md`
- `package.json`
- `pnpm-lock.yaml`
- `README.md`
- `.github`
- `scripts/harness`
- `.agents`
- `.opencode`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/<modulo>/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: [estado atual do código]
## O que criar:
- `path/arquivo.ts` → [o que faz]
## Especificação: [assinaturas, regras, comportamento esperado]
## Critério de conclusão:
- [ ] [verificação objetiva]
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 07-tornar-repo-pronto-para-clonar-e-usar-onboarding.md`
## Complexidade: alta

## Baseline (git)
- context/agents/queue/07-tornar-repo-pronto-para-clonar-e-usar-onboarding.md
