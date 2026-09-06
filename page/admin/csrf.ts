import type { MiddlewareHandler } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { tryGetContext } from 'hono/context-storage'
import { cacheAdminSession, type AdminGetSession } from './guard'

export const ADMIN_CSRF_FIELD = '_csrf'

const CSRF_TOKEN_VAR = 'adminCsrfToken'
type CsrfEnv = { Variables: { adminCsrfToken?: string } }

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export const issueCsrfToken = (sessionKey: string, secret: string) => createHmac('sha256', secret).update(sessionKey).digest('hex')

export const verifyCsrfToken = (token: unknown, sessionKey: string, secret: string) => {
    if (typeof token !== 'string' || !CSRF_TOKEN_PATTERN.test(token)) return false
    const expected = issueCsrfToken(sessionKey, secret)
    if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

type CsrfGuardDeps = {
    getSession: AdminGetSession
    secret?: string
}

export const createAdminCsrfGuard =
    (deps: CsrfGuardDeps): MiddlewareHandler =>
    async (c, next) => {
        const { secret } = deps
        if (!secret) return STATE_CHANGING_METHODS.has(c.req.method) ? c.text('CSRF secret not configured', 403) : next()
        const session = await deps.getSession(c)
        cacheAdminSession(c, session)
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
