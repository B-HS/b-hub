import { createAppError } from '../../lib/error'
import { getRedisClient } from './redis-client'

const REDIS_INCREMENT_KEY_COUNT = 1

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`

/**
 * Shared rate limit counter backed by Redis.
 * INCR and PEXPIRE run in one Lua script so the window is applied atomically.
 */
export const createRedisRateLimitStore = ({ url }: { url: string }) => {
    const client = getRedisClient(url)

    const increment = async (key: string, windowMs: number) => {
        await client.ensureConnected()
        const raw = await client.redis.eval(INCREMENT_SCRIPT, REDIS_INCREMENT_KEY_COUNT, key, String(windowMs))
        const values = Array.isArray(raw) ? raw : []
        const count = Number(values[0])
        const ttlMs = Number(values[1])
        if (!Number.isFinite(count)) throw createAppError('INTERNAL_ERROR')
        return { count, resetAt: Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs) }
    }

    const reset = async (key: string) => {
        await client.ensureConnected()
        await client.redis.del(key)
    }

    return { increment, reset }
}
