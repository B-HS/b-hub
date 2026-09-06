import { getEnv } from '../../lib/env'
import { captureException } from '../../lib/sentry'
import { createCache } from './cache'
import { getRedisClient } from './redis-client'

const LOCAL_CACHE_TTL_MS = 30_000
const LOCAL_CACHE_MAX_SIZE = 500

const localCache = createCache<string>({ maxSize: LOCAL_CACHE_MAX_SIZE, defaultTtlMs: LOCAL_CACHE_TTL_MS })

const getRedis = () => {
    const url = getEnv().REDIS_URL
    if (!url) return null
    return getRedisClient(url)
}

export const redisCache = {
    get: async <T>(key: string): Promise<T | null> => {
        const cached = localCache.get(key)
        if (cached !== null) return JSON.parse(cached) as T

        const client = getRedis()
        if (!client) return null

        try {
            await client.ensureConnected()
            const val = await client.redis.get(key)
            if (val === null) return null

            const parsed = JSON.parse(val) as T
            localCache.set(key, val, LOCAL_CACHE_TTL_MS)
            return parsed
        } catch (error) {
            captureException(error)
            return null
        }
    },

    set: async <T>(key: string, value: T, ttlSeconds: number) => {
        const json = JSON.stringify(value)
        localCache.set(key, json, Math.min(ttlSeconds * 1000, LOCAL_CACHE_TTL_MS))

        const client = getRedis()
        if (!client) return

        try {
            await client.ensureConnected()
            await client.redis.set(key, json, 'EX', ttlSeconds)
        } catch (error) {
            captureException(error)
        }
    },
}
