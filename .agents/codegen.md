# .agents/codegen.md
# Carregar ANTES de qualquer geração de código

## Protocolo obrigatório — 5 passos antes de gerar

```
1. REVISAR  → ler arquivos existentes do módulo alvo
2. MAPEAR   → listar o que pode ser reaproveitado
3. PERGUNTAR → apresentar mapeamento e confirmar antes de gerar
4. GERAR    → apenas o confirmado, na densidade certa por camada
5. ANOTAR   → indicar o que foi reaproveitado vs criado
```

Nunca pule para o passo 4 sem completar 1, 2 e 3.

## Passo 2 — o que verificar antes de criar

**Packages compartilhados — nunca recriar:**
- `@saas/contracts` → DomainError, NotFoundError, ForbiddenError, EventBus, PaginatedResult, ListParams, eventos
- `@saas/ui` → DataTable, Skeleton, EmptyState, Pagination, todos os componentes de UI
- `@saas/ui-mobile` → componentes React Native compartilhados
- `@saas/api-client` → instância http configurada com interceptors

**Apresente antes de gerar:**
```
"✅ Reaproveitado: DomainError (@saas/contracts), DataTable (@saas/ui)
🆕 A criar: OcorrenciaEntity, CreateOcorrenciaUseCase, OcorrenciasListView
⚠️ Similar encontrado: ListParams — posso estender com status. Prefere assim?"
```
Aguarde confirmação. Nunca gere na mesma mensagem do mapeamento.

## Densidade por camada

| Camada | Gerar |
|---|---|
| Domain Entity | Esqueleto + invariantes (sem infra) |
| Domain Event | Completo (é pequeno) |
| Repository Interface | Mínimo necessário — sem métodos especulativos |
| Use Case | Completo — aqui vale cada token |
| Repository Prisma | Completo — implementação da interface |
| Controller | Completo — autorização + delegação + resposta |
| ViewModel | Completo — View depende de tudo |
| View | Estrutura + estados (loading/erro/vazio) — sem Tailwind extenso |
| Testes | Completo — teste incompleto é pior que nenhum |

## Nunca incluir

- Comentários que repetem o código
- Imports não usados
- Métodos especulativos ("pode precisar no futuro")
- Tipos que são apenas alias de primitivo sem restrição
- Código defensivo onde o middleware já garantiu a invariante

## Sempre incluir

- Tratamento de not-found e forbidden nos caminhos críticos
- Tipos de retorno explícitos em funções públicas exportadas
- Barrel export atualizado (`index.ts` do módulo)
- Path do arquivo no topo de cada bloco de código
- Resumo: o que foi reaproveitado vs criado + próximos passos

## Padrões de reaproveitamento

- **Extensão:** tipo quase igual → `interface MeuParams extends ListParams { status?: string }`
- **Composição:** componente de UI → passar `columns` pro DataTable, não recriar tabela
- **Extração:** apareceu em 2 módulos → mover para `@saas/ui` ou `@saas/contracts`
- **Hook base:** ViewModels de listagem iguais → `useListViewModel<T>(queryKey, fetcher)`
