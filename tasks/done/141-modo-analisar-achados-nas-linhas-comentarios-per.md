# Task: modo analisar: achados nas linhas, comentarios, perguntas so leitura
## Agente: `frontend`
## Módulo: `harness`
## Feature: modo-analisar
## Prioridade: P1
## Tipo: feat
## ACs: AC-1, AC-2, AC-3, AC-4, AC-5
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/run.js`
- `scripts/harness/src/lib/runner.js`
- `scripts/harness/src/lib/runs.js`
- `scripts/harness/src/lib/db.js`
- `scripts/harness/src/lib/runs-api.js`
- `scripts/harness/src/lib/conversation.js`
- `scripts/harness/src/lib/findings.js`
- `scripts/harness/src/lib/workspace-page.html`
- `scripts/harness/tests/analyze.test.js`
- `README.md`
- `AGENTS.md`
- `context/modules/harness/status.md`
- `context/features/modo-analisar/spec.md`
- `context/features/modo-analisar/plan.md`
## Depende de: [x] `140`
## Contexto para ler: context/modules/harness/context.md
## Skills a carregar: codegen.md + frontend.md
## O que já existe: Workspace (140) com conversa, mudanças e gates; revisões só no fluxo.
## O que criar:
- `scripts/harness/src/lib/findings.js` → achados `arquivo:linha` da revisão e veredito
- vista Analisar em `workspace-page.html` + papel `ask` (só leitura) no run
## Especificação: ver context/features/modo-analisar/spec.md (AC-1..AC-5) e plan.md.
## Critério de conclusão:
- [ ] perguntas só leitura com guarda; achados e comentários na tela Analisar; enviar ao agente
- [ ] `node --test scripts/harness/tests/*.test.js` passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 141-modo-analisar-achados-nas-linhas-comentarios-per.md`
## Complexidade: alta

## Baseline (git)
- apps/desktop/package-lock.json
- context/features/modo-analisar/plan.md
- context/features/modo-analisar/spec.md
- tasks/queue/141-modo-analisar-achados-nas-linhas-comentarios-per.md
