import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Fallback local (docker-compose); em produção, defina DATABASE_URL.
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/{{NAME}}'

const adapter = new PrismaPg({ connectionString })

// Cliente único compartilhado por apps e módulos (packages/prisma).
export const prisma = new PrismaClient({ adapter })

// Contrato para o middleware de tenancy injetar tenantId em toda query tenant-scoped.
// Implementação no módulo @saas/tenancy.
export type TenancyMiddleware = (tenantId: string) => void

export type { Prisma } from './generated/prisma/client'
