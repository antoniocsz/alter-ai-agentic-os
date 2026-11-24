# Task: docs api local e canvas interativo
## Agente: `docs`
## Módulo: `harness`
## Feature: api-local
## Prioridade: P2
## Tipo: docs
## ACs: AC-1, AC-6
## Escopo (arquivos que esta task vai tocar):
- `README.md`
- `AGENTS.md`
- `scripts/harness/src/commands/index.js`
- `context/features/api-local/spec.md`
## Depende de: [ ] `116`
## Contexto para ler: context/features/api-local/spec.md · handoffs 115 e 116 em context/modules/harness/status.md
## Skills a carregar: codegen.md + docs.md
## O que já existe: API local e canvas interativo entregues (115, 116); README ainda descreve o canvas como só leitura.
## O que criar:
- `README.md` → seção "API local e canvas interativo" (rotas, segurança, serve.json, --allow-unsafe), ajuste da seção do canvas e da tabela da CLI
- `AGENTS.md` → como disparar/parar pelo painel e pela API
- `commands/index.js` → help do `serve` com `--allow-unsafe`
- `spec.md` → ACs marcados + Estado
## Especificação: documentação fiel ao que foi entregue.
## Critério de conclusão:
- [x] README, AGENTS.md e help atualizados
- [x] Spec com ACs marcados e Estado
- [x] `harness check` ok
## Ao terminar: atualizar `context/modules/harness/status.md`, rodar `node scripts/harness/bin/harness.js finish 117`
## Complexidade: baixa

## Baseline (git)
- tasks/queue/117-docs-api-local-e-canvas-interativo.md
