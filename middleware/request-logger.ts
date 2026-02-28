import type { Context, Next } from 'hono'
import type { Database } from '../db/index'
import { apiRequestLog } from '../db/schema'
import { captureException } from '../lib/sentry'

type RequestLoggerDeps = {
    db: Database
}

export const requestLogger = (deps: RequestLoggerDeps) => async (c: Context, next: Next) => {
    const start = Date.now()
    await next()
    const durationMs = Date.now() - start

    const userId = (() => {
        try {
            return c.get('user')?.id ?? null
        } catch {
            return null
        }
    })()

    const errorCode = (() => {
        try {
            return c.get('errorCode') ?? null
        } catch {
            return null
        }
    })()

    deps.db
        .insert(apiRequestLog)
        .values({
            method: c.req.method,
            path: c.req.path,
            statusCode: c.res.status,
            userId,
            ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? null,
            userAgent: c.req.header('user-agent') ?? null,
            durationMs,
            errorCode,
        })
        .catch((e) => captureException(e))
}
