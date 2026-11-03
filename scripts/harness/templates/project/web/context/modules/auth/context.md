# @saas/auth — Contexto do Módulo

## Responsabilidade
Cadastro, autenticação e gestão de perfil de usuários.

## Entidades
- **User** — id, email, passwordHash, name, avatarUrl

## Use Cases
- `RegisterUseCase` — criar conta, gera token de verificação, publica `user.created`
- `LoginUseCase` — validar credenciais
- `RefreshTokenUseCase` — validar refresh token (rotation)
- `GetProfileUseCase` — obter dados do perfil
- `UpdateProfileUseCase` — atualizar nome/avatar, publica `user.updated`
- `VerifyEmailUseCase` — verificar email com token
- `SendVerificationEmailUseCase` — enviar email de verificação
- `ResendVerificationEmailUseCase` — reenviar email de verificação (com rate limit)
- `ForgotPasswordUseCase` — gera token de reset (TTL 15min, single-use) e publica `password.reset.requested`
- `ResetPasswordUseCase` — valida token de reset, atualiza o hash e publica `password.reset`

## Eventos que Publica
- `user.created`, `user.updated`, `password.reset.requested`, `password.reset`

## Eventos que Consome
- Nenhum (módulo base)

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)
- `@fastify/jwt` (access 15min) + refresh token (7d, rotation, revogação)
- `IPasswordHasher` (bcrypt/argon2)

## Repositórios
- `IUserRepository` — interface para persistência de usuários
- `IPasswordResetTokenRepository` — interface para tokens de reset (single-use)

## Regras
- Senha nunca em claro — hash via `IPasswordHasher`
- Rate limit em `register` (5 req/15min)
- Email verificado antes de operações sensíveis (configurável)
- Token de reset é single-use com TTL 15min — expirado ou reutilizado é rejeitado
- Após o reset, todos os refresh tokens do usuário são revogados