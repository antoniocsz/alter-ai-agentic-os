# Task: Definition of Ready + prioridade + paridade CI (Fase 8 🔴)
## Agente: `coordinator` (hardening)
## Módulo: `harness`
## Escopo (arquivos que esta task vai tocar):
- `scripts/harness/src/lib/pipeline.js`
- `scripts/harness/src/task.js`
- `scripts/harness/src/check.js`
- `scripts/harness/src/lib/memory.js`
- `scripts/harness/templates/task/task.md.tpl`
- `scripts/harness/tests/dor.test.js`
- `scripts/harness/templates/project/_base/.github/workflows/harness.yml`
- `scripts/harness/templates/project/web/.github/workflows/ci.yml`
- `scripts/harness/templates/project/api/.github/workflows/ci.yml`
- `AGENTS.md`
- `README.md`
## Depende de: [x] 33-segredos-redaction.md
## Contexto para ler: plano v0.3 (F8 🔴 DoR + priorização)
## Skills a carregar: codegen.md
## O que já existe:
- start só valida conflito de escopo; queue é FIFO por número.
- Task template sem prioridade.
## O que criar:
- `task --priority P0..P3` (default P2) + `## Prioridade` no template.
- `start` aplica DoR: escopo declarado, critério de conclusão, spec da feature existente e dependência concluída.
- `check` valida valores de prioridade.
- `status` ordena a fila por prioridade (P0 primeiro) e mostra próximas.
## Especificação:
- DoR falha com lista do que falta; nada é movido.
- Dependência aceita prefixo numérico (`32`) ou nome do arquivo.
- Tasks antigas sem `## Prioridade` continuam válidas (apenas não ordenam).
## Critério de conclusão:
- [ ] start bloqueia sem escopo/aceite/spec/dependência
- [ ] prioridade validada e ordenada
- [ ] `pnpm test` verde
## Ao terminar: rodar `pnpm harness finish 34-dor-prioridade.md --handoff "<resumo>"`
## Complexidade: média
