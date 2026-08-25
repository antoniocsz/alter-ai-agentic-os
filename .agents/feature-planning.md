# .agents/feature-planning.md
# Carregar para planejar novas features

## Protocolo — 4 fases em ordem

```
1. CLARIFICAR  → entender o requisito com o humano (uma pergunta por vez)
2. MAPEAR      → identificar módulos, camadas e agentes necessários
3. CONFIRMAR   → apresentar plano e aguardar confirmação
4. GERAR TASKS → criar arquivos em context/agents/queue/
```

## Fase 1 — Perguntas de clarificação (uma por vez)

```
Bloco A — Escopo
1. "Descreve o que a feature faz do ponto de vista de quem usa."
2. "Quem vai usar? (platform-admin / org-owner / org-member / client-user)"
3. "Em qual superfície aparece? (admin / org / client / mobile / API)"

Bloco B — Regras
4. "Tem restrição ou regra importante? (plano, limite, aprovação...)"
5. "Tem estados ou ciclo de vida? (rascunho → publicado...)"
6. "O que acontece quando dá errado?"

Bloco C — Integração
7. "Conecta com algo que já existe?"
8. "Alguma outra parte precisa reagir quando isso acontece?"
9. "Precisa aparecer no mobile também?"

Bloco D — Aceite
10. "Como você sabe que está pronta e funcionando?"
```

## Fase 2 — Ordem padrão de dependências

```
1. Domain (entities, events)        ← base de tudo
2. Repository interface             ← contrato de dados
3. Use case(s)                      ← lógica de negócio
4. Repository Prisma + migration    ← persiste dados
5. Controller + Route               ← expõe na API
6a. Frontend ViewModel + View       ← paralelo com 6b e 6c
6b. Mobile Screen                   ← paralelo com 6a e 6c
6c. Regra CASL                      ← paralelo com 6a e 6b
7. Event handlers (notificações...) ← paralelo com 6*
```

## Fase 3 — Apresentar antes de gerar

```
"Módulos: [lista]
Agentes necessários: [lista]
Tasks:
[1] Setup módulo → agente-backend
[2] Domain entity + evento → agente-backend
[3] UseCase → agente-backend
...
[6a] ViewModel + View → agente-frontend (paralelo)
[6b] Mobile Screen → agente-mobile (paralelo)
Ficou correto?"
```

## Fase 4 — Template de task (context/agents/queue/)

Nome: `<prefixo>-<agente>-<descricao>.md`
Ex: `01-backend-domain-ocorrencia.md`, `06a-frontend-viewmodel-ocorrencias.md`

```markdown
# Task: [descrição em 1 linha]
## Agente: `agente-<especialidade>`
## Módulo: `packages/modules/<modulo>`
## Depende de: [ ] `<arquivo-da-task-anterior>.md`
## Contexto para ler: context/modules/<modulo>/context.md
## Skills a carregar: codegen.md + <especialidade>.md
## O que já existe: [estado atual do código]
## O que criar:
- `path/arquivo.ts` → [o que faz]
## Especificação: [assinaturas, regras, comportamento esperado]
## Critério de conclusão:
- [ ] [verificação objetiva]
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, mover para agents/done/
## Complexidade: baixa | média | alta
```
