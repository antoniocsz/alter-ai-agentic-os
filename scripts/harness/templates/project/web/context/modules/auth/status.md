# @saas/auth — Status

## Fase 1 — Fundação
- [ ] Domain entities (User)
- [ ] Repository interface (IUserRepository)
- [ ] Use cases (Register, Login, RefreshToken, GetProfile, UpdateProfile, ForgotPassword, ResetPassword)
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
- [ ] Typecheck: [ ]

## Handoff
- [ ] Preenchido ao finalizar cada task: feito / pendências / decisões