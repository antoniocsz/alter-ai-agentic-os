# .agents/infra.md
# Carregar para tarefas de infra (EasyPanel + CI/CD + EAS)

## EasyPanel — serviços

| Serviço | Tipo | Build command |
|---|---|---|
| api | App (Nixpacks) | `pnpm turbo build --filter=@saas/app-api` |
| web-* | App (Nixpacks) | `pnpm turbo build --filter=@saas/app-<nome>` |
| postgres | Database | — |
| redis | Database | — |

Comunicação interna pelo nome do serviço: `postgres:5432`, `redis:6379`.
SSL gerenciado automaticamente (Let's Encrypt).
Health check obrigatório: `GET /health` retorna 200 quando pronto.

## nixpacks.toml — evitar problemas comuns

```toml
[phases.setup]
nixPkgs = ["nodejs_20"]
[phases.install]
cmds = ["npm install -g pnpm@9", "pnpm install --frozen-lockfile"]
```

## CI/CD — GitHub Actions

```yaml
# Pipeline por app — só roda quando o app ou suas deps mudam
on:
  push:
    branches: [main]
    paths: ['apps/api/**', 'packages/modules/**', 'packages/contracts/**']
jobs:
  test-and-deploy:
    steps:
      - run: pnpm turbo typecheck --filter=@saas/app-api...
      - run: pnpm turbo test --filter=@saas/app-api...
      - run: pnpm turbo build --filter=@saas/app-api
      - run: pnpm prisma migrate deploy  # antes de iniciar o serviço
      - name: Deploy EasyPanel
        run: curl -X POST ${{ secrets.EASYPANEL_WEBHOOK_API }} -H "Authorization: Bearer ${{ secrets.EASYPANEL_TOKEN }}"
```

## Mobile — EAS

```bash
# OTA update (JS apenas) — automático no CI para cada push em main
eas update --channel production --message "feat: ..."

# Build nativo — só quando há mudança nativa (adicionar [native] no commit)
eas build --profile production --platform all --non-interactive
```

## Migrations em produção — NUNCA migrate dev

```bash
pnpm prisma migrate deploy  # aplica pendentes, nunca cria novas
```
