# Task: Repositórios Prisma (auth, family, finance)
## Agente: `agente-backend`
## Módulo: `packages/modules/auth`, `packages/modules/family`, `packages/modules/finance`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/auth/src/infra/repositories/**`
- `packages/modules/family/src/infra/repositories/**`
- `packages/modules/finance/src/infra/repositories/**`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/auth/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: interfaces de repositório (IUserRepository, IFamilyRepository, IFamilyMemberRepository, IAccountRepository, ICategoryRepository, ITransactionRepository) e schema Prisma
## O que criar:
- `PrismaUserRepository` → implements IUserRepository
- `PrismaFamilyRepository` / `PrismaFamilyMemberRepository` → implements IFamilyRepository / IFamilyMemberRepository
- `PrismaAccountRepository` / `PrismaCategoryRepository` / `PrismaTransactionRepository` → implements IAccountRepository / ICategoryRepository / ITransactionRepository
## Especificação: implementações em `packages/modules/*/src/infra/repositories/`; extends `@saas/contracts`; tenant isolation por familyId em toda query; registros ausentes lançam NotFoundError
## Critério de conclusão:
- [ ] Todos os repositories implementados e exportados no barrel de cada módulo
- [ ] Tenant isolation por familyId (teste: tenant A não vê dado de B)
- [ ] NotFoundError em registros ausentes
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md dos módulos, mover para agents/done/
## Complexidade: alta