# Task: Módulo auth (autenticação — @saas/auth)
## Agente: `agente-backend`
## Módulo: `packages/modules/auth`
## Escopo (arquivos que esta task vai tocar):
- `packages/modules/auth/**`
- `context/modules/auth/context.md`
- `context/modules/auth/status.md`
## Depende de: [ ] `01-module-tenancy.md`
## Contexto para ler: context/modules/auth/context.md
## Skills a carregar: codegen.md + backend.md + security.md
## O que já existe: definição do módulo em context/modules/auth/ (sem código)
## O que criar:
- `harness module auth` → scaffold da árvore do módulo
- Entidade User
- Interface IUserRepository + implementação Prisma
- Use cases: Register, Login, RefreshToken, GetProfile, UpdateProfile, ForgotPassword, ResetPassword
- `IPasswordHasher` (bcrypt/argon2) + JWT (access 15min, refresh 7d com rotation)
- `IPasswordResetTokenRepository` (token single-use, TTL 15min) + rotas `/auth/forgot-password|reset-password`
- Middleware verify-jwt + rotas Fastify (`/auth/register|login|refresh|me`)
## Especificação:
- Senha nunca em claro — hash via `IPasswordHasher` no RegisterUseCase
- Refresh token com rotation e revogação (token antigo rejeitado)
- Rate limit em `register` (5 req/15min)
- Token de reset single-use (TTL 15min); reset revoga refresh tokens do usuário
- `user.created`/`user.updated`/`password.reset` publicados via EventBus
- Barrel `src/index.ts` exporta só o público
## Critério de conclusão:
- [ ] `harness module auth` executado e árvore criada
- [ ] Use cases completos com DIP (interfaces)
- [ ] Teste: refresh rotation (token antigo rejeitado)
- [ ] Teste: reset com token expirado/reutilizado rejeitado
- [ ] Teste: register com senha fraca rejeitado (Zod)
- [ ] verify-jwt nas rotas protegidas
- [ ] Barrel export atualizado
- [ ] Typecheck passando: `pnpm turbo typecheck --filter=@saas/auth`
- [ ] Lint passando
## Ao terminar: atualizar status.md, rodar `pnpm harness finish 03` e registrar handoff
## Complexidade: alta