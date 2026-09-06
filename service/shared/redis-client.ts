import Redis from 'ioredis'
import { captureException } from '../../lib/sentry'

const REDIS_CONNECT_TIMEOUT_MS = 3000
const REDIS_MAX_RETRIES_PER_REQUEST = 1

type RedisClient = {
    redis: Redis
    ensureConnected: () => Promise<void>
}

let cachedClient: RedisClient | null = null
let cachedClientUrl: string | null = null

const createRedisClient = (url: string): RedisClient => {
    const redis = new Redis(url, {
        maxRetriesPerRequest: REDIS_MAX_RETRIES_PER_REQUEST,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        lazyConnect: true,
        enableOfflineQueue: false,
    })
    redis.on('error', (error) => captureException(error))

    let initialConnect: Promise<void> | null = null
    const ensureConnected = async () => {
        if (redis.status === 'ready') return
        if (redis.status === 'wait') initialConnect = redis.connect()
        if (initialConnect) await initialConnect
    }

    return { redis, ensureConnected }
}

/**
 * Returns the process-wide Redis client for the given URL, creating it lazily.
 * The first command waits for the initial connection to become ready; once connected,
 * commands issued during an outage fail immediately (no offline queue) while ioredis
 * reconnects in the background.
 */
export const getRedisClient = (url: string) => {
    if (cachedClient && cachedClientUrl === url) return cachedClient
    cachedClient = createRedisClient(url)
    cachedClientUrl = url
    return cachedClient
}
