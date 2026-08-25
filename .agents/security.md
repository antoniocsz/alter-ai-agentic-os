# .agents/security.md
# Carregar para tarefas de segurança (API, Auth, Dados, LGPD)

## API — proteção básica obrigatória

```typescript
// Helmet + CORS restrito + Rate limit global
await fastify.register(helmet)
await fastify.register(cors, { origin: ['https://app.seudominio.com', ...], credentials: true })
await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute',
  keyGenerator: (req) => req.user?.id ?? req.ip })

// Rate limit específico em endpoints sensíveis
fastify.post('/auth/login', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, ...)
```

## Auth — JWT seguro

```typescript
// Access token: 15min, secret próprio, jwtid único
// Refresh token: 7d, secret DIFERENTE, rotation obrigatória
// Logout: blacklist AMBOS no Redis pelo TTL restante
// Login: bcrypt salt 12, mensagem genérica (não revelar se email existe)
// Timing attack: sempre rodar bcrypt mesmo quando usuário não existe
```

## Dados sensíveis — AES-256-GCM

```typescript
// CPF, dados bancários: encryptField() antes de salvar, decryptField() ao ler
// Nunca armazenar número de cartão — usar Stripe
// FIELD_ENCRYPTION_KEY: 64 chars hex, nunca commitado
```

## Audit log — toda ação crítica

```typescript
await auditLogger.log({ tenantId, userId, action: 'delete', resource: 'ClientAccount', resourceId: id })
// Manter 5 anos (obrigação legal LGPD)
```

## LGPD — endpoints obrigatórios

```
GET  /privacy/my-data    → exportar todos os dados do usuário
DELETE /privacy/my-account → anonimizar (não deletar — preserva audit trail)
```

## Checklist rápido de segurança

- [ ] Validação Zod em todo body de POST/PUT/PATCH
- [ ] Output nunca expõe password, tokens ou campos sensíveis
- [ ] Queries Prisma com parâmetros, nunca interpolação em $queryRaw
- [ ] Stack trace nunca em resposta de produção
- [ ] Webhook Stripe verifica assinatura com rawBody
