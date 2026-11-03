import { describe, it, expect } from 'vitest'
import { buildApp } from './server'

describe('health', () => {
  it('GET /health responde 200', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
