// URL de fallback local (docker-compose); em produção, defina DATABASE_URL.
// Função lazy (não const): o dotenv do prisma.config.ts roda antes da primeira
// chamada — ordem de avaliação ESM avalia imports primeiro e só invoca a função
// no momento do uso, garantindo que process.env.DATABASE_URL já foi populado.
const DEV_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/{{NAME}}'

export const databaseUrl = (): string => process.env.DATABASE_URL ?? DEV_DATABASE_URL
