import { timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'

type CronAuthDeps = {
    cronSecret: string
}

export const cronAuth = (deps: CronAuthDeps) => async (c: Context, next: Next) => {
    if (!deps.cronSecret) {
        throw createAppError('HN_CRON_SECRET_INVALID')
    }

    const authHeader = c.req.header('Authorization') ?? ''
    const expected = `Bearer ${deps.cronSecret}`

    if (authHeader.length !== expected.length) {
        throw createAppError('HN_CRON_SECRET_INVALID')
    }

    const encoder = new TextEncoder()
    const a = encoder.encode(authHeader)
    const b = encoder.encode(expected)

    if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
        throw createAppError('HN_CRON_SECRET_INVALID')
    }

    await next()
}
