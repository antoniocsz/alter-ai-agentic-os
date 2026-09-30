// Prisma 7: a URL saiu do schema.prisma e vive aqui (Prisma 7 não carrega .env sozinho).
// Carrega o .env da raiz do monorepo independente do cwd do CLI.
// import.meta.dirname (Node 22+, ESM): __dirname não existe em ESM e quebraria o
// typecheck com o tsconfig deste package (prisma.config.ts entra no include).
import path from 'node:path'
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { databaseUrl } from './src/config'

config({ path: path.resolve(import.meta.dirname, '../../.env') })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: {
    url: databaseUrl()
  }
})
