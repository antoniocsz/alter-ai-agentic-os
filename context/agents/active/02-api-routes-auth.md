# Tarefa: Rotas de Auth (API)

**Módulo:** @saas/auth
**Depende de:** 01-prisma-repositories

## O que fazer
- POST /api/v1/auth/register — cadastro
- POST /api/v1/auth/login — login (retorna JWT + refresh token)
- POST /api/v1/auth/refresh — refresh token
- GET /api/v1/auth/me — perfil
- PATCH /api/v1/auth/me — atualizar perfil

## Middlewares
- Zod validation nos inputs
- verify-jwt nas rotas protegidas
