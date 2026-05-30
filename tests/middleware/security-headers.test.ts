import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { securityHeaders } from '../../middleware/security-headers'

const createApp = () => {
    const app = new Hono()
    app.use('*', securityHeaders())
    app.get('/test', (c) => c.text('ok'))
    return app
}

const createConfiguredApp = () => {
    const app = new Hono()
    app.use('*', securityHeaders({ htmlPaths: ['/admin'], excludeExactPaths: ['/'] }))
    app.get('/admin/dashboard', (c) => c.html('<html></html>'))
    app.get('/api/anything', (c) => c.json({ ok: true }))
    app.get('/', (c) => c.html('<html></html>'))
    return app
}

describe('securityHeaders middleware', () => {
    test('X-Content-Type-Options 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    test('X-Frame-Options 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    })

    test('X-XSS-Protection 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })

    test('Strict-Transport-Security 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
    })

    test('Referrer-Policy 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    test('Content-Security-Policy 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        const csp = res.headers.get('Content-Security-Policy')
        expect(csp).toContain("default-src 'none'")
        expect(csp).toContain("script-src 'none'")
        expect(csp).toContain("frame-ancestors 'none'")
    })

    test('Permissions-Policy 헤더를 설정한다', async () => {
        const res = await createApp().request('/test')
        const pp = res.headers.get('Permissions-Policy')
        expect(pp).toContain('camera=()')
        expect(pp).toContain('microphone=()')
        expect(pp).toContain('geolocation=()')
        expect(pp).toContain('payment=()')
    })
})

describe('securityHeaders htmlPaths (admin)', () => {
    test('htmlPaths 경로는 스타일시트를 허용하는 CSP를 받는다', async () => {
        const res = await createConfiguredApp().request('/admin/dashboard')
        const csp = res.headers.get('Content-Security-Policy') ?? ''
        expect(csp).toContain("style-src 'self' 'unsafe-inline'")
        expect(csp).not.toContain("style-src 'none'")
        expect(csp).toContain("form-action 'self'")
        expect(csp).toContain("frame-ancestors 'none'")
    })

    test('htmlPaths 경로도 X-Frame-Options DENY를 유지한다', async () => {
        const res = await createConfiguredApp().request('/admin/dashboard')
        expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    })

    test('API 경로는 여전히 엄격한 CSP(style-src none)를 받는다', async () => {
        const res = await createConfiguredApp().request('/api/anything')
        const csp = res.headers.get('Content-Security-Policy') ?? ''
        expect(csp).toContain("style-src 'none'")
        expect(csp).toContain("script-src 'none'")
    })

    test('제외된 정확 경로는 CSP가 없다', async () => {
        const res = await createConfiguredApp().request('/')
        expect(res.headers.get('Content-Security-Policy')).toBeNull()
    })
})
