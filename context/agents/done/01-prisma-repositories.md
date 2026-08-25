# Tarefa: Implementar Repositórios Prisma

**Módulo:** @saas/auth, @saas/family, @saas/finance
**Depende de:** Setup inicial completo + pnpm install + migration

## O que fazer
- Implementar `PrismaUserRepository` (implements IUserRepository)
- Implementar `PrismaFamilyRepository` (implements IFamilyRepository)
- Implementar `PrismaFamilyMemberRepository` (implements IFamilyMemberRepository)
- Implementar `PrismaAccountRepository` (implements IAccountRepository)
- Implementar `PrismaCategoryRepository` (implements ICategoryRepository)
- Implementar `PrismaTransactionRepository` (implements ITransactionRepository)
- Colocar em `packages/modules/*/src/infra/repositories/`

## Critérios
- extends `@saas/contracts`
- Tenant isolation por familyId
- Tratamento de not-found com NotFoundError
