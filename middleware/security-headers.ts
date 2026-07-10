import type { Context, Next } from 'hono'

type SecurityHeadersOptions = {
    excludePaths?: string[]
    excludeExactPaths?: string[]
    htmlPaths?: string[]
}

const API_CSP = "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'"

const ADMIN_CONFIRM_SCRIPT_CSP_HASH = "'sha256-d/h63esA6Zy4JDK7V/PydEU0eF9eucbYR8fZvugUP80='"

const HTML_CSP = `default-src 'none'; script-src ${ADMIN_CONFIRM_SCRIPT_CSP_HASH}; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`

export const securityHeaders = (options?: SecurityHeadersOptions) => async (c: Context, next: Next) => {
    await next()
    const isExcluded = options?.excludePaths?.some((p) => c.req.path.startsWith(p)) || options?.excludeExactPaths?.includes(c.req.path)
    const isHtml = options?.htmlPaths?.some((p) => c.req.path.startsWith(p))
    c.header('X-Content-Type-Options', 'nosniff')
    if (!isExcluded) c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (!isExcluded) c.header('Content-Security-Policy', isHtml ? HTML_CSP : API_CSP)
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
}
