import type { Context, MiddlewareHandler } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { tryGetContext } from 'hono/context-storage'

export const ADMIN_CSRF_FIELD = '_csrf'

const CSRF_TOKEN_VAR = 'adminCsrfToken'
type CsrfEnv = { Variables: { adminCsrfToken?: string } }

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const issueCsrfToken = (sessionKey: string, secret: string) => createHmac('sha256', secret).update(sessionKey).digest('hex')

export const verifyCsrfToken = (token: unknown, sessionKey: string, secret: string) => {
    if (typeof token !== 'string' || token.length === 0) return false
    const expected = issueCsrfToken(sessionKey, secret)
    if (token.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

type CsrfGuardDeps = {
    getSession: (c: Context) => Promise<{ user: { id: string } } | null>
    secret?: string
}

export const createAdminCsrfGuard =
    (deps: CsrfGuardDeps): MiddlewareHandler =>
    async (c, next) => {
        const { secret } = deps
        if (!secret) return next()
        const session = await deps.getSession(c)
        if (!session) return next()
        const sessionKey = session.user.id
        c.set(CSRF_TOKEN_VAR, issueCsrfToken(sessionKey, secret))
        if (STATE_CHANGING_METHODS.has(c.req.method)) {
            const body = await c.req.parseBody()
            if (!verifyCsrfToken(body[ADMIN_CSRF_FIELD], sessionKey, secret)) return c.text('CSRF token mismatch', 403)
        }
        return next()
    }

export const readCsrfToken = (): string | null => tryGetContext<CsrfEnv>()?.get(CSRF_TOKEN_VAR) ?? null
