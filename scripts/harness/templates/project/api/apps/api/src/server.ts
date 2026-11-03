import Fastify from 'fastify'

export function buildApp() {
  const app = Fastify({ logger: false })
  app.get('/health', async () => ({ status: 'ok' }))
  return app
}

const port = Number(process.env.PORT ?? 3000)
buildApp().listen({ port, host: '0.0.0.0' })
