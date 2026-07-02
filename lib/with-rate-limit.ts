import type { Context } from 'hono'
import { createAppError } from './error'
import type { HonoVariables } from './hono-types'

type AuthUser = HonoVariables['user']

type CheckLimitFn = (key: string, path: string) => { allowed: boolean; limit: number; remaining: number; resetAt: number }

export const withRateLimit =
    (deps: { checkLimit: CheckLimitFn; pathKey?: string }) =>
    (handler: (c: Context, user: AuthUser) => Promise<Response>) =>
    async (c: Context, user: AuthUser) => {
        const result = deps.checkLimit(user.id, deps.pathKey ?? c.req.path)
        c.header('X-RateLimit-Limit', String(result.limit))
        c.header('X-RateLimit-Remaining', String(result.remaining))
        c.header('X-RateLimit-Reset', String(result.resetAt))
        if (!result.allowed) throw createAppError('RATE_LIMIT_EXCEEDED')
        return handler(c, user)
    }
