import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createManageRoute } from '../../../page/manage'
import { issueCsrfToken } from '../../../page/admin/csrf'
import { mockAdmin, mockUser, sessionOf, stubAiService, stubApiTokenService, stubMailAccountService, stubWeatherApiKeyService } from './helpers'

const SECRET = 'test-csrf-secret'

const createApp = (sessionUser: typeof mockAdmin | typeof mockUser | null, csrfSecret?: string) => {
    const app = new Hono()
    app.route(
        '/manage',
        createManageRoute({
            getSession: sessionOf(sessionUser),
            apiTokenService: stubApiTokenService(),
            weatherApiKeyService: stubWeatherApiKeyService(),
            aiService: stubAiService(),
            mailAccountService: stubMailAccountService(),
            csrfSecret,
        }),
    )
    return app
}

const manageRoutes = ['/manage', '/manage/ai/keys', '/manage/tokens', '/manage/weather/keys']

describe('Manage 라우트 번들링', () => {
    test('로그인 사용자(비관리자 포함)에게 모든 섹션이 200을 반환한다', async () => {
        for (const user of [mockAdmin, mockUser]) {
            const app = createApp(user)
            for (const path of manageRoutes) {
                const res = await app.request(path)
                expect(res.status).toBe(200)
                const html = await res.text()
                expect(html).toContain('<html')
            }
        }
    })

    test('미인증 사용자는 모든 섹션에서 /manage/login으로 리다이렉트한다', async () => {
        const app = createApp(null)
        for (const path of manageRoutes) {
            const res = await app.request(path)
            expect(res.status).toBe(303)
            expect(res.headers.get('location')).toContain('/manage/login')
        }
    })

    test('GET /manage/styles.css는 인증 없이도 200을 반환한다', async () => {
        const app = createApp(null)
        const res = await app.request('/manage/styles.css')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type') ?? '').toContain('text/css')
    })

    test('GET /manage/login은 인증 없이 200을 반환한다', async () => {
        const app = createApp(null)
        const res = await app.request('/manage/login')
        expect(res.status).toBe(200)
    })

    test('GET /manage/theme는 쿠키를 설정하고 리다이렉트한다', async () => {
        const app = createApp(mockUser)
        const res = await app.request('/manage/theme?to=light&returnTo=/manage/tokens')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/tokens')
        expect(res.headers.get('set-cookie') ?? '').toContain('manage_theme=light')
    })

    test('외부 returnTo는 거부되고 /manage로 폴백한다', async () => {
        const app = createApp(mockUser)
        const res = await app.request('/manage/theme?to=dark&returnTo=https://evil.com')
        expect(res.headers.get('location')).toBe('/manage')
    })
})

describe('Manage CSRF 가드', () => {
    test('시크릿이 있으면 폼에 _csrf 히든 토큰이 렌더링된다', async () => {
        const token = issueCsrfToken(mockUser.id, SECRET)
        const res = await createApp(mockUser, SECRET).request('/manage/tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('name="_csrf"')
        expect(html).toContain(token)
    })

    test('토큰이 없는 POST는 403을 반환한다', async () => {
        const res = await createApp(mockUser, SECRET).request('/manage/tokens', {
            method: 'POST',
            body: new URLSearchParams({ name: 'x' }),
        })
        expect(res.status).toBe(403)
    })

    test('유효한 토큰을 포함한 POST는 통과한다', async () => {
        const token = issueCsrfToken(mockUser.id, SECRET)
        const res = await createApp(mockUser, SECRET).request('/manage/tokens', {
            method: 'POST',
            body: new URLSearchParams({ name: 'x', _csrf: token }),
        })
        expect(res.status).toBe(200)
    })

    test('시크릿이 없으면 CSRF 검증이 비활성화된다', async () => {
        const res = await createApp(mockUser).request('/manage/tokens', {
            method: 'POST',
            body: new URLSearchParams({ name: 'x' }),
        })
        expect(res.status).toBe(200)
    })
})
