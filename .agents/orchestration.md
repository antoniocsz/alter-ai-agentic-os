# .agents/orchestration.md
# Carregar para orquestrar execução paralela de subagents (agente-coordinator)

## Quando usar

- Várias tasks na queue com escopos disjuntos
- Coordenar subagents (agente-backend/frontend/mobile) em paralelo
- Integrar e revisar o resultado conjunto

## Protocolo do coordenador

```
1. LER queue (context/agents/queue/) e agrupar tasks por módulo
2. FORMAR lotes paralelos → tasks com ## Escopo disjuntos (sem arquivo compartilhado)
3. PARA CADA lote:
   a. pnpm harness start <task>   ← valida conflito de escopo (bloqueia se sobrepor)
   b. spawnar 1 subagent por task (Task tool), prompt mínimo:
      "Leia a task <arquivo>.md e execute-a seguindo o protocolo do AlterAI - Agentic OS.
       Carregue codegen.md antes de gerar código. Respeite o ## Escopo.
       Conclua com pnpm harness finish <task>."
   c. aguardar todos os subagents do lote
4. pnpm harness check [--barrel --db] → zero violações
5. REVISAR done/ (agente-reviewer ou critérios de .agents/review.md)
6. HANDOFF: resumo do lote via pnpm harness log "<resumo>" --kind note --source agent
```

## Regras de segurança

- Nunca iniciar task com escopo sobreposto ao de outra ativa — `harness start` já bloqueia; se bloquear, **serialize** (uma depois da outra)
- Task sem `## Escopo` não roda em paralelo com nada
- Se `harness finish` falhar por escopo: o subagent deve **reverter** só os arquivos fora do escopo, ou **estender o `## Escopo`** com aprovação do usuário
- Conflito de arquivo entre subagents: parar, revisar com o usuário, nunca `git checkout`/`reset` sem aprovação
- Após cada lote, considerar `git commit` das mudanças aprovadas para o `finish` do próximo lote não ver arquivos de outro lote

## Handoff padrão (gravar ao final de cada lote)

```
Lote <n> — tasks: [ids]
Feito: <o que foi implementado>
Pendências: <o que ficou>
Decisões: <arquiteturais, se houver>
Revisado: <aprovado/devolvido>
```