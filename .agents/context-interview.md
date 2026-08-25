# .agents/context-interview.md
# Carregar para onboarding de projeto novo ou módulo novo

## Quando usar

- Projeto novo sem `context/` existente
- Módulo novo sendo adicionado
- Agente entrando num projeto sem contexto suficiente

## Protocolo — 7 blocos, um por vez, confirmar antes de avançar

```
Bloco 1 → Produto e problema         → gera context/project/overview.md
Bloco 2 → Domínio e módulos          → gera context/project/domain-model.md
Bloco 3 → Multi-tenancy e hierarquia → impacta tenancy/ e authorization/
Bloco 4 → Permissões e papéis        → impacta authorization/
Bloco 5 → Apps e superfícies         → impacta estrutura de apps/
Bloco 6 → Stack e restrições         → gera context/project/stack.md
Bloco 7 → Prioridades                → gera context/agents/queue/ com tasks iniciais
```

## Regras do protocolo

- Uma pergunta (ou bloco pequeno) por vez
- Reformular o entendimento antes de avançar: "Então o que entendi é..."
- Confirmar ao final de cada bloco: "Ficou correto?"
- Só gerar arquivos após confirmação do bloco relacionado
- Só avançar ao próximo bloco após confirmação explícita

## Perguntas por bloco

**Bloco 1:** Qual problema resolve e pra quem? | Quem são os usuários? | Do zero ou evoluindo? | Referência de mercado?
**Bloco 2:** Grandes áreas de negócio? | Quais se comunicam? | Qual é mais crítica? | Conceito que aparece em várias?
**Bloco 3:** Multi-tenant? | Hierarquia entre tenants? | Usuário em mais de um tenant? | Como identifica o tenant ativo?
**Bloco 4:** Quais papéis? | Fixos ou customizáveis? | Regra que depende do conteúdo do dado? | Quem gerencia permissões?
**Bloco 5:** Painel admin interno? | Painel da empresa contratante? | Interface do cliente final? | Landing/SEO? | Mobile? | Subdomínios?
**Bloco 6:** Stack frontend? | Stack backend? | Banco + ORM? | Pagamento? | Mobile stack? | Restrições técnicas?
**Bloco 7:** O que é mais urgente? | Dependência que bloqueia? | Decisão já tomada? | Backend, frontend ou paralelo?

## Saída esperada ao fim

```
context/
├── project/overview.md
├── project/domain-model.md
├── project/stack.md
└── agents/queue/
    ├── 01-<task>.md
    └── 02-<task>.md
```

Perguntar ao final: "Posso criar os ADRs iniciais com base nas decisões que tomamos?"
