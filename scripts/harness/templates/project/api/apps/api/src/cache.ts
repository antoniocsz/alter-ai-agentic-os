// Cache Redis com lazy connect — não conecta no import (seguro para testes).
import { Redis } from 'ioredis'

const url = process.env.REDIS_URL ?? 'redis://localhost:6379'

export function createCache() {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 })

  return {
    async connect() {
      if (redis.status === 'wait') await redis.connect()
    },
    async get<T>(key: string): Promise<T | null> {
      const raw = await redis.get(key)
      return raw ? (JSON.parse(raw) as T) : null
    },
    async set(key: string, value: unknown, ttlSeconds?: number) {
      const raw = JSON.stringify(value)
      if (ttlSeconds) await redis.set(key, raw, 'EX', ttlSeconds)
      else await redis.set(key, raw)
    },
    async del(key: string) {
      await redis.del(key)
    },
    async disconnect() {
      await redis.quit()
    }
  }
}
