# Task: Rotas de Auth (API)
## Agente: `agente-backend`
## Módulo: `packages/modules/auth`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/auth/src/infra/http/auth.routes.ts`
- `packages/modules/auth/src/infra/http/auth.controller.ts`
## Depende de: [ ] `01-prisma-repositories.md`
## Contexto para ler: context/modules/auth/context.md
## Skills a carregar: codegen.md + backend.md + authorization.md
## O que já existe: use cases de auth (Register, Login, RefreshToken, GetProfile, UpdateProfile) e repositório Prisma
## O que criar:
- `auth.routes.ts` → rotas Fastify (register, login, refresh, me)
- `auth.controller.ts` → controllers com Zod validation + verify-jwt
## Especificação: POST /api/v1/auth/register|login|refresh; GET/PATCH /api/v1/auth/me; Zod validation nos inputs; verify-jwt nas rotas protegidas
## Critério de conclusão:
- [ ] Rotas registradas e controllers delegando aos use cases
- [ ] Zod validation em todo body
- [ ] verify-jwt nas rotas protegidas
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 02`
## Complexidade: média