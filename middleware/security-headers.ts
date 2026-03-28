import type { Context, Next } from 'hono'

type SecurityHeadersOptions = {
    excludePaths?: string[]
    excludeExactPaths?: string[]
}

export const securityHeaders = (options?: SecurityHeadersOptions) => async (c: Context, next: Next) => {
    await next()
    const isExcluded = options?.excludePaths?.some((p) => c.req.path.startsWith(p)) || options?.excludeExactPaths?.includes(c.req.path)
    c.header('X-Content-Type-Options', 'nosniff')
    if (!isExcluded) c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (!isExcluded) {
        c.header(
            'Content-Security-Policy',
            "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'",
        )
    }
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
}
