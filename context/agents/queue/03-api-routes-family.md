# Tarefa: Rotas de Family (API)

**Módulo:** @saas/family
**Depende de:** 01-prisma-repositories, 02-api-routes-auth

## O que fazer
- POST /api/v1/families — criar família
- GET /api/v1/families/current — obter família atual do usuário
- POST /api/v1/families/:familyId/invite — convidar membro (admin)
- POST /api/v1/families/invites/:memberId/accept — aceitar convite
- DELETE /api/v1/families/:familyId/members/:memberId — remover membro (admin)
