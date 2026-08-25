# .agents/testing.md
# Carregar para tarefas de testes (Vitest + Playwright)

## Pirâmide e onde cada teste vive

```
[E2E Playwright]      → tests/e2e/ — fluxos críticos do usuário
[Integração Vitest]   → *.integration.spec.ts — controller + banco real
[Unitário Vitest]     → *.spec.ts — domain, use-cases (zero banco)
```

## Unitário — nunca bate no banco

```typescript
// Mock de repository
function makeOcorrenciaRepositoryMock(): OcorrenciaRepository {
  return { findById: vi.fn(), findAll: vi.fn(), save: vi.fn(), delete: vi.fn() }
}

// Teste de use-case
it('deve criar e publicar evento', async () => {
  const repo = makeOcorrenciaRepositoryMock()
  const eventBus = { publish: vi.fn() }
  const sut = new CreateOcorrenciaUseCase(repo, eventBus)
  await sut.execute({ titulo: 'Vazamento', tenantId: 'tenant-1', requesterId: 'user-1' })
  expect(repo.save).toHaveBeenCalledOnce()
  expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ocorrencia.criada' }))
})
```

## Integração — banco real, isolamento por tenant

```typescript
beforeEach(async () => {
  await clearTestDatabase()               // limpa antes de cada suite
  const tenant = await makeTenantFactory()
  authToken = makeAuthToken({ tenantId: tenant.id, role: 'org-owner' })
})

// Teste obrigatório em toda feature multi-tenant:
it('não deve vazar dados de outro tenant', async () => {
  const outroTenant = await makeTenantFactory()
  await makeCondominioFactory({ tenantId: outroTenant.id })
  const response = await server.inject({ method: 'GET', url: '/condominios',
    headers: { authorization: `Bearer ${authToken}`, 'x-tenant-id': tenantId } })
  expect(JSON.parse(response.body).items).toHaveLength(0)
})
```

## Factories — padrão para criar dados de teste

```typescript
makeUserFactory({ tenantId, role: 'org-owner' })
makeTenantFactory({ status: 'active' })
makeAuthToken({ userId, tenantId, role })  // JWT de teste
```

## E2E — fluxos críticos obrigatórios

Login, troca de tenant, criar recurso principal, billing (checkout → acesso), permissão negada.
