type RateLimitConfig = {
    windowMs: number
    maxRequests: number
}

type RateLimitEntry = {
    count: number
    resetAt: number
}

type RateLimitResult = {
    allowed: boolean
    limit: number
    remaining: number
    resetAt: number
}

export const createRateLimiter = (config: RateLimitConfig) => {
    const store = new Map<string, RateLimitEntry>()

    const cleanup = () => {
        const now = Date.now()
        for (const [key, entry] of store) {
            if (entry.resetAt <= now) {
                store.delete(key)
            }
        }
    }

    setInterval(cleanup, config.windowMs)

    const checkLimit = (key: string): RateLimitResult => {
        const now = Date.now()
        const entry = store.get(key)

        if (!entry || entry.resetAt <= now) {
            store.set(key, { count: 1, resetAt: now + config.windowMs })
            return {
                allowed: true,
                limit: config.maxRequests,
                remaining: config.maxRequests - 1,
                resetAt: now + config.windowMs,
            }
        }

        entry.count++
        const allowed = entry.count <= config.maxRequests
        return {
            allowed,
            limit: config.maxRequests,
            remaining: Math.max(0, config.maxRequests - entry.count),
            resetAt: entry.resetAt,
        }
    }

    const reset = (key: string) => {
        store.delete(key)
    }

    return { checkLimit, reset }
}
