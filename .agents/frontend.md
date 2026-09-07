# .agents/frontend.md
# Carregar para tarefas de UI (Next.js + MVVM)

## MVVM — regra absoluta

```typescript
// Model — sem hooks, sem JSX
export const ocorrenciaRepository = {
  list: (params) => apiClient.get('/ocorrencias', { params }),
}

// ViewModel — orquestra tudo, retorna dados + callbacks prontos
export function useOcorrenciasListViewModel() {
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''))
  const { data, isLoading } = useQuery({
    queryKey: ['ocorrencias', page, search],
    queryFn: () => ocorrenciaRepository.list({ page, search }),
  })
  return { ocorrencias: data?.items ?? [], isLoading, page, search, setPage, setSearch }
}

// View — só JSX, zero useQuery/useMutation/useForm diretamente
export function OcorrenciasListView() {
  const vm = useOcorrenciasListViewModel()
  if (vm.isLoading) return <Skeleton />
  return <DataTable data={vm.ocorrencias} onPageChange={vm.setPage} />
}

// Page — importa só a View
export default function Page() { return <OcorrenciasListView /> }
```

## Estado — onde cada coisa vive

| Dado | Onde |
|---|---|
| Servidor | TanStack Query |
| Filtros / paginação / tabs | nuqs (url-state) |
| UI client-only (modal, seleção wizard) | Zustand |
| Formulários | React Hook Form + Zod |

## Schemas Zod — definir em `model/schemas.ts`, compartilhar com backend via `@<escopo>/contracts` quando possível

## CASL no frontend — UI apenas, segurança está no backend

```tsx
<Can I="delete" a="Ocorrencia" this={ocorrencia} ability={ability}>
  <Button variant="destructive">Excluir</Button>
</Can>
```
