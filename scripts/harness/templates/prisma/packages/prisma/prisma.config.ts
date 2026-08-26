// Prisma 7: a URL saiu do schema.prisma e vive aqui (Prisma 7 não carrega .env sozinho).
// Carrega o .env da raiz do monorepo independente do cwd do CLI.
import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

config({ path: path.resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
})
