import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createLoginRoute, type LoginRouteDeps } from '../../../page/admin/login'

const mockAdmin = { id: 'a1', name: 'Admin', email: 'admin@example.com', role: 'admin', image: null }
const mockUser = { id: 'u1', name: 'User', email: 'user@example.com', role: 'user', image: null }

type AuthDep = NonNullable<LoginRouteDeps['auth']>

const makeAuth = (overrides: Partial<{ signInSocial: AuthDep['api']['signInSocial']; signOut: AuthDep['api']['signOut'] }> = {}) =>
    ({
        api: {
            signInSocial: mock(async () =>
                new Response(JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth?x=1', redirect: true }), {
                    status: 200,
                    headers: { location: 'https://accounts.google.com/o/oauth2/auth?x=1', 'set-cookie': 'ba.state=abc; Path=/; HttpOnly' },
                }),
            ),
            signOut: mock(async () =>
                new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'set-cookie': 'ba.session_token=; Max-Age=0; Path=/' },
                }),
            ),
            ...overrides,
        },
    }) as unknown as AuthDep

const createApp = (getSession: LoginRouteDeps['getSession'], auth?: LoginRouteDeps['auth']) => {
    const app = new Hono()
    app.route('/admin/login', createLoginRoute({ getSession, auth }))
    return app
}

describe('GET /admin/login', () => {
    test('미인증 사용자는 200과 로그인 옵션을 본다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/admin/login')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('hyun-hub Admin')
        expect(html).toContain('Google 로그인')
        expect(html).toContain('GitHub 로그인')
        expect(html).toContain('/admin/login/social/google?next=')
        expect(html).toContain('/admin/login/social/github?next=')
    })

    test('관리자는 next 경로로 리다이렉트한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request('/admin/login?next=/admin/users')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/users')
    })

    test('관리자에게 next 없으면 /admin으로 보낸다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request('/admin/login')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin')
    })

    test('외부 도메인 next는 오픈 리다이렉트로 처리하지 않고 /admin으로 막는다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request(`/admin/login?next=${encodeURIComponent('https://evil.com')}`)
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin')
    })

    test('admin 접두사가 아닌 상대경로 next도 /admin으로 막는다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request(`/admin/login?next=${encodeURIComponent('/etc/passwd')}`)
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin')
    })

    test('비관리자는 권한 부족 안내와 로그아웃 링크를 본다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const res = await createApp(getSession).request('/admin/login')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('user@example.com')
        expect(html).toContain('어드민 권한이 없습니다')
        expect(html).toContain('/admin/login/logout')
    })
})

describe('GET /admin/login/social/:provider', () => {
    test('google 로그인은 302로 provider URL에 리다이렉트하고 state 쿠키를 전달한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const auth = makeAuth()
        const res = await createApp(getSession, auth).request('/admin/login/social/google?next=/admin/users')
        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('https://accounts.google.com/o/oauth2/auth?x=1')
        expect(res.headers.getSetCookie()).toContain('ba.state=abc; Path=/; HttpOnly')
        expect(auth.api.signInSocial).toHaveBeenCalledTimes(1)
        const arg = (auth.api.signInSocial as ReturnType<typeof mock>).mock.calls[0][0] as { body: { provider: string; callbackURL: string } }
        expect(arg.body.provider).toBe('google')
        expect(arg.body.callbackURL).toBe('/admin/users')
    })

    test('next가 외부 도메인이면 callbackURL을 /admin으로 정규화한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const auth = makeAuth()
        await createApp(getSession, auth).request(`/admin/login/social/google?next=${encodeURIComponent('https://evil.com')}`)
        const arg = (auth.api.signInSocial as ReturnType<typeof mock>).mock.calls[0][0] as { body: { callbackURL: string } }
        expect(arg.body.callbackURL).toBe('/admin')
    })

    test('Location 헤더가 없어도 JSON url로 리다이렉트한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const auth = makeAuth({
            signInSocial: mock(async () =>
                new Response(JSON.stringify({ url: 'https://github.com/login/oauth/authorize?y=2', redirect: true }), {
                    status: 200,
                    headers: { 'set-cookie': 'ba.state=zzz; Path=/' },
                }),
            ) as AuthDep['api']['signInSocial'],
        })
        const res = await createApp(getSession, auth).request('/admin/login/social/github?next=/admin')
        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('https://github.com/login/oauth/authorize?y=2')
    })

    test('지원하지 않는 provider는 /admin/login으로 막는다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const auth = makeAuth()
        const res = await createApp(getSession, auth).request('/admin/login/social/evil')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/login')
        expect(auth.api.signInSocial).not.toHaveBeenCalled()
    })

    test('auth 의존성이 없으면 /admin/login으로 폴백한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/admin/login/social/google')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/login')
    })
})

describe('GET /admin/login/logout', () => {
    test('로그아웃은 302로 /admin/login에 보내고 세션 쿠키 무효화를 전달한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const auth = makeAuth()
        const res = await createApp(getSession, auth).request('/admin/login/logout')
        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('/admin/login')
        expect(res.headers.getSetCookie()).toContain('ba.session_token=; Max-Age=0; Path=/')
        expect(auth.api.signOut).toHaveBeenCalledTimes(1)
    })

    test('auth 의존성이 없으면 /admin/login으로 폴백한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/admin/login/logout')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/login')
    })
})
