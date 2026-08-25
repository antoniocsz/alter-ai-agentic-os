# @saas/auth — Status

## Fase 1 — Fundação
- [ ] Domain entities (User)
- [ ] Repository interface (IUserRepository)
- [ ] Use cases (Register, Login, RefreshToken, GetProfile, UpdateProfile)
- [ ] Prisma repository implementation
- [ ] HTTP routes/controllers
- [ ] Testes unitários (6)
- [ ] Testes de integração (6 API)

## Fase 2 — Refinamentos
- [ ] Password hash movido do handler para `RegisterUseCase` via `IPasswordHasher`
- [ ] Rate limit na rota de register (5 req/15min)
- [ ] Event subscriber (`on-user-created`) desacoplado do Prisma
- [ ] Email verification flow (token, resend, verify)
- [ ] Forgot / Reset password flow (token, email, reset)
- [ ] `IMailProvider.sendInviteEmail()` — suporte a email de convite familiar
- [ ] Typecheck: ✅

## Restauração do revert 191347b (01/08/2026)
- [ ] Remoções do revert restauradas (Prisma 7, bullmq, findRecurringDue, update completo de bill, rotas admin/chat, event-bus sequencial, webhook)
- [ ] Typecheck monorepo: 20/20 ✅
- [ ] Lint apps/api: 0 erros ✅
