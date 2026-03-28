import type { Hono } from 'hono'
import { cors } from 'hono/cors'
import { securityHeaders } from './security-headers'
import { errorHandler } from './error-handler'
import type { AuthContext } from '../lib/hono-types'

type MiddlewareDeps = {
    allowedDomains: string[]
    securityExcludePaths?: string[]
    securityExcludeExactPaths?: string[]
}

const isAllowedOrigin = (origin: string, allowedDomains: string[]) => {
    try {
        const { hostname } = new URL(origin)
        for (const domain of allowedDomains) {
            if (hostname === domain || hostname.endsWith(`.${domain}`)) return true
        }
        if (process.env.NODE_ENV !== 'production' && hostname === 'localhost') return true
        return false
    } catch {
        return false
    }
}

export const createMiddleware = (app: Hono<AuthContext>, deps: MiddlewareDeps) => {
    app.use(
        '/api/*',
        cors({
            origin: (origin) => (origin && isAllowedOrigin(origin, deps.allowedDomains) ? origin : ''),
            credentials: true,
        }),
    )
    app.use('*', securityHeaders({ excludePaths: deps.securityExcludePaths, excludeExactPaths: deps.securityExcludeExactPaths }))
    app.use('*', errorHandler())
}
