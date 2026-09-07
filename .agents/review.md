# .agents/review.md
# Carregar para revisar tasks concluídas (agente-reviewer / coordenador)

## Quando usar

- Validar tasks em `done/` antes de integrar
- Validar o merge de trabalho paralelo de subagents
- Gate final do pipeline (executar junto com `harness check`)

## Protocolo de revisão

```
1. RODAR harness check [--barrel --db] → zero violações
2. CONFERIR escopo → cada arquivo alterado está no ## Escopo da task (harness finish já valida)
3. CONFERIR status.md do módulo → atualizado, com bloco ## Handoff
4. CONFERIR handoff → o que foi feito, pendências, decisões
5. REVISAR o diff → critérios abaixo
6. APROVAR ou DEVOLVER (mover done → active com harness reopen)
```

## Critérios de aprovação

- **Fronteiras:** nenhum import interno de outro módulo (`@<escopo>/outro/src/...`); só barrel público
- **Multi-tenant:** toda query tenant-scoped tem o filtro; teste "tenant A não vê dado de B"
- **MVVM:** View sem hooks de dados direto; ViewModel orquestra; Model sem JSX/hooks
- **DIP:** use-cases recebem interfaces (repository/provider), nunca `PrismaClient` direto
- **Codegen:** segue `.agents/codegen.md` — sem código especulativo, sem comentários redundantes
- **Erros:** not-found/forbidden nos caminhos críticos; handler global (não repetido em controller)
- **Testes:** unitário não bate no banco; integração isola por tenant; critério de conclusão da task cumprido
- **Segurança:** sem secret commitado; validação Zod em body; output não expõe dados sensíveis

## Saída esperada

```
✅ Aprovado — task <id> (handoff: <resumo>)
OU
🔁 Devolvido — task <id> (motivos: ...; movida para active com harness reopen)
```

Registrar a decisão: `pnpm harness log "review <id>: aprovado/devolvido — <motivo>" --task <id> --kind note --source agent`