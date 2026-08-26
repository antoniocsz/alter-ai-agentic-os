# Task: Repositórios Prisma (auth)
## Agente: `agente-backend`
## Módulo: `packages/modules/auth`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/auth/src/infra/repositories/**`
## Depende de: [ ] `-`
## Contexto para ler: context/modules/auth/context.md
## Skills a carregar: codegen.md + backend.md
## O que já existe: interface de repositório (IUserRepository) e schema Prisma
## O que criar:
- `PrismaUserRepository` → implements IUserRepository
## Especificação: implementação em `packages/modules/auth/src/infra/repositories/`; extends `@saas/contracts`; registros ausentes lançam NotFoundError
## Critério de conclusão:
- [ ] Repository implementado e exportado no barrel do módulo
- [ ] NotFoundError em registros ausentes
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md do módulo, mover para agents/done/
## Complexidade: média