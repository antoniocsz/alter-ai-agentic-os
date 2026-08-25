# @saas/auth — Contexto do Módulo

## Responsabilidade
Cadastro, autenticação e gestão de perfil de usuários.

## Entidades
- **User** — id, email, passwordHash, name, avatarUrl

## Use Cases
- `RegisterUseCase` — criar conta, gera token de verificação, publica `user.created`
- `LoginUseCase` — validar credenciais
- `RefreshTokenUseCase` — validar refresh token
- `GetProfileUseCase` — obter dados do perfil
- `UpdateProfileUseCase` — atualizar nome/avatar, publica `user.updated`
- `VerifyEmailUseCase` — verificar email com token
- `SendVerificationEmailUseCase` — enviar email de verificação
- `ResendVerificationEmailUseCase` — reenviar email de verificação (com rate limit)

## Eventos que Publica
- `user.created`, `user.updated`

## Eventos que Consome
- Nenhum (módulo base)

## Dependências
- `@saas/contracts` (tipos, erros, eventos, EventBus)

## Repositórios
- `IUserRepository` — interface para persistência de usuários
