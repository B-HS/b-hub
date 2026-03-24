import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL ?? '', {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
})

const memoryStore = new Map<string, { value: string; expiresAt: number }>()

export const redisCache = {
    get: async <T>(key: string): Promise<T | null> => {
        const mem = memoryStore.get(key)
        if (mem && mem.expiresAt > Date.now()) {
            return JSON.parse(mem.value) as T
        }
        if (mem) memoryStore.delete(key)

        try {
            const val = await redis.get(key)
            if (val === null) return null

            const parsed = JSON.parse(val) as T
            memoryStore.set(key, { value: val, expiresAt: Date.now() + 30_000 })
            return parsed
        } catch {
            return null
        }
    },

    set: async <T>(key: string, value: T, ttlSeconds: number) => {
        const json = JSON.stringify(value)
        memoryStore.set(key, { value: json, expiresAt: Date.now() + Math.min(ttlSeconds * 1000, 30_000) })

        try {
            await redis.set(key, json, 'EX', ttlSeconds)
        } catch {
            // Redis 실패해도 인메모리 캐시는 유지
        }
    },
}
