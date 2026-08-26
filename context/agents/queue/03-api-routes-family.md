# Task: Rotas de Family (API)
## Agente: `agente-backend`
## Módulo: `packages/modules/family`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/family/src/infra/http/family.routes.ts`
- `packages/modules/family/src/infra/http/invites.routes.ts`
## Depende de: [ ] `02-api-routes-auth.md`
## Contexto para ler: context/modules/family/context.md
## Skills a carregar: codegen.md + backend.md + authorization.md
## O que já existe: use cases de family (Create, GetCurrent, Invite, Accept, Remove) e repositório Prisma
## O que criar:
- `family.routes.ts` → POST /api/v1/families, GET /api/v1/families/current
- `invites.routes.ts` → POST invite, POST accept, DELETE member
## Especificação: POST /api/v1/families; GET /api/v1/families/current; POST /api/v1/families/:familyId/invite (admin); POST /api/v1/families/invites/:memberId/accept; DELETE /api/v1/families/:familyId/members/:memberId (admin)
## Critério de conclusão:
- [ ] Rotas registradas com autorização por papel (admin para invite/remove)
- [ ] Zod validation nos inputs
- [ ] Typecheck passando
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 03`
## Complexidade: média