# Task: {{DESCRIPTION}}
## Agente: `{{AGENT}}`
## Módulo: `{{MODULE}}`
## Escopo (arquivos que esta task vai tocar):
{{SCOPE}}
## Depende de: [ ] `{{DEP}}`
## Contexto para ler: context/modules/{{MODULE_NAME}}/context.md
## Skills a carregar: codegen.md + {{AGENT_REF}}
## O que já existe: [estado atual do código]
## O que criar:
- `path/arquivo.ts` → [o que faz]
## Especificação: [assinaturas, regras, comportamento esperado]
## Critério de conclusão:
- [ ] [verificação objetiva]
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish {{FILE}}`
## Complexidade: {{COMPLEXITY}}
