import { Redis } from '@upstash/redis'

const redis = new Redis({ url: process.env.REDIS_URL ?? '' })

const memoryStore = new Map<string, { value: string; expiresAt: number }>()

export const redisCache = {
    get: async <T>(key: string): Promise<T | null> => {
        const mem = memoryStore.get(key)
        if (mem && mem.expiresAt > Date.now()) {
            return JSON.parse(mem.value) as T
        }
        if (mem) memoryStore.delete(key)

        const val = await redis.get<string>(key)
        if (val === null) return null

        const parsed = typeof val === 'string' ? JSON.parse(val) : val
        memoryStore.set(key, { value: JSON.stringify(parsed), expiresAt: Date.now() + 30_000 })
        return parsed as T
    },

    set: async <T>(key: string, value: T, ttlSeconds: number) => {
        const json = JSON.stringify(value)
        memoryStore.set(key, { value: json, expiresAt: Date.now() + Math.min(ttlSeconds * 1000, 30_000) })
        await redis.set(key, json, { ex: ttlSeconds })
    },
}
