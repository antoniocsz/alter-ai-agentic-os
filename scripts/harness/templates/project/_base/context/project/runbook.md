# Runbook — {{NAME}}

> Operação do projeto. Preencha conforme o perfil/stack. O agente deve consultar este arquivo
> antes de qualquer deploy, migration ou operação destrutiva.

## Ambientes

| Ambiente | URL/host | Acesso | Observações |
|---|---|---|---|
| dev | local | — | |
| staging | | | |
| prod | | | |

## Deploy

1. [pré-requisitos: migrations, env vars, backup]
2. [comando/serviço de deploy]
3. [verificação pós-deploy: healthcheck, smoke test]

## Rollback

1. [como reverter a versão anterior]
2. [como restaurar dados, se aplicável]

## Banco de dados

- Migrations: [ferramenta e comando]
- Reversibilidade: [migrations são reversíveis? plano B]
- Backup: [frequência, onde, como restaurar]

## Segredos e configuração

- Onde vivem (nunca no repositório): [secret manager / env do provedor]
- Como rotacionar: [procedimento]

## Incidentes

- Contato/on-call:
- Dashboard/logs:
- Runbook de incidente:
