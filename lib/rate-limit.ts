import { captureException } from './sentry'

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

export type RateLimitStore = {
    increment: (key: string, windowMs: number) => Promise<{ count: number; resetAt: number }>
    reset?: (key: string) => Promise<void>
}

type CheckLimitReturn<TStore> = TStore extends RateLimitStore ? Promise<RateLimitResult> : RateLimitResult

type ResetReturn<TStore> = TStore extends RateLimitStore ? Promise<void> : void

export const createRateLimiter = <TStore extends RateLimitStore | undefined = undefined>(config: RateLimitConfig, store?: TStore) => {
    const entries = new Map<string, RateLimitEntry>()

    const toResult = (count: number, resetAt: number) => ({
        allowed: count <= config.maxRequests,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        resetAt,
    })

    const cleanup = () => {
        const now = Date.now()
        for (const [key, entry] of entries) {
            if (entry.resetAt <= now) {
                entries.delete(key)
            }
        }
    }

    const cleanupTimer = setInterval(cleanup, config.windowMs)
    cleanupTimer.unref()

    const checkLimitInMemory = (key: string) => {
        const now = Date.now()
        const entry = entries.get(key)

        if (!entry || entry.resetAt <= now) {
            const resetAt = now + config.windowMs
            entries.set(key, { count: 1, resetAt })
            return toResult(1, resetAt)
        }

        entry.count++
        return toResult(entry.count, entry.resetAt)
    }

    const checkLimitShared = async (key: string, sharedStore: RateLimitStore) => {
        try {
            const { count, resetAt } = await sharedStore.increment(key, config.windowMs)
            return toResult(count, resetAt)
        } catch (error) {
            captureException(error)
            return checkLimitInMemory(key)
        }
    }

    const resetInMemory = (key: string) => {
        entries.delete(key)
    }

    const resetShared = async (key: string, sharedStore: RateLimitStore) => {
        resetInMemory(key)
        try {
            await sharedStore.reset?.(key)
        } catch (error) {
            captureException(error)
        }
    }

    const checkLimit = (key: string) => (store ? checkLimitShared(key, store) : checkLimitInMemory(key)) as CheckLimitReturn<TStore>

    const reset = (key: string) => (store ? resetShared(key, store) : resetInMemory(key)) as ResetReturn<TStore>

    return { checkLimit, reset }
}
