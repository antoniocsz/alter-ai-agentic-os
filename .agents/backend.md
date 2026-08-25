# .agents/backend.md
# Carregar para tarefas de API (Fastify + Prisma + SOLID)

## Estrutura de módulo backend

```
packages/modules/<feature>/src/
├── domain/
│   ├── entities/        # Aggregates — lógica pura, sem infra
│   ├── value-objects/
│   ├── events/          # o que este módulo publica
│   └── repositories/    # interfaces (nunca implementações)
├── use-cases/<acao>/    # um diretório por caso de uso
└── infra/
    ├── repositories/    # implementações Prisma
    └── http/            # controllers + rotas Fastify
```

## Regras SOLID aplicadas

- **S:** UseCase faz UMA coisa. Controller só delega.
- **O:** Novo caso de uso = novo arquivo, não editar existentes.
- **L:** PrismaRepo e MockRepo intercambiáveis no UseCase.
- **I:** Repository interface só com métodos que o domínio usa agora.
- **D:** UseCase recebe interface, nunca `PrismaClient` diretamente.

## Padrões obrigatórios

```typescript
// Entity — construtor privado, factory method
export class Ocorrencia {
  private constructor(public readonly id: string, ...) {}
  static create(props: CreateProps): Ocorrencia { /* valida invariantes */ }
}

// UseCase — recebe interfaces, publica evento, retorna DTO simples
export class CreateOcorrenciaUseCase {
  constructor(private repo: OcorrenciaRepository, private eventBus: EventBus) {}
  async execute(input: Input): Promise<{ id: string }> { ... }
}

// Controller — autorização + delegação + status code correto
export async function createOcorrenciaController(request, reply) {
  if (request.ability.cannot('create', 'Ocorrencia')) throw new ForbiddenError()
  const { id } = await useCase.execute({ ...request.body, tenantId: request.tenantId })
  return reply.status(201).send({ id })
}
```

## Error handling global (não repetir nos controllers)

```typescript
// DomainError → 422 | NotFoundError → 404 | ForbiddenError → 403
// Stack trace NUNCA em produção — handler global no Fastify trata tudo
```

## tenantId — nunca esquecer

```typescript
// Repository sempre filtra por tenantId:
findById(id: string, tenantId: string): Promise<Entity | null>
findAll(params: { tenantId: string; ... }): Promise<PaginatedResult<Entity>>
```
