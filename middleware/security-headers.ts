import type { Context, Next } from 'hono'

export const securityHeaders = () => async (c: Context, next: Next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'",
    )
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
}
