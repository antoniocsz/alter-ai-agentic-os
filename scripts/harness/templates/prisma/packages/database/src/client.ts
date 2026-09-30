import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { databaseUrl } from './config'

// Singleton: evita múltiplas conexões em hot-reload (dev) e testes.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Contrato para o middleware de tenancy injetar tenantId em toda query tenant-scoped.
// Implementação no módulo @saas/tenancy.
export type TenancyMiddleware = (tenantId: string) => void
