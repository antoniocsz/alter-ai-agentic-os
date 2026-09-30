// Seed mínimo e idempotente: garante um Tenant demo para desenvolvimento.
// Nunca executa em produção (NODE_ENV === 'production').
import { prisma } from '../src/client'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('seed: pulado em produção (NODE_ENV=production)')
    return
  }

  const tenant = await prisma.tenant.upsert({
    where: { id: 'tenant-default' },
    update: {},
    create: { id: 'tenant-default', name: 'Default' }
  })
  console.log(`seed: tenant demo pronto (${tenant.id})`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
