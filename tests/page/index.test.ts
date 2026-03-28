import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createPage } from '../../page'

const TOKEN = 'test-caldav-token-abc123'

const toBasicAuth = (username: string, password: string) => `Basic ${btoa(`${username}:${password}`)}`

const createApp = () => {
    const app = new Hono()
    app.route('', createPage())
    return app
}

describe('/.well-known/caldav', () => {
    describe('GET', () => {
        test('인증 없으면 401과 WWW-Authenticate 헤더를 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav')
            expect(res.status).toBe(401)
            expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="CalDAV"')
        })

        test('token 쿼리 파라미터가 있으면 /caldav/:token/으로 301 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request(`/.well-known/caldav?token=${TOKEN}`, { redirect: 'manual' })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })

        test('Basic Auth password에서 토큰을 추출하여 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav', {
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })

        test('trailing slash가 있어도 동일하게 동작한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav/')
            expect(res.status).toBe(401)
        })

        test('trailing slash + token 쿼리 파라미터로 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request(`/.well-known/caldav/?token=${TOKEN}`, { redirect: 'manual' })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })
    })

    describe('PROPFIND', () => {
        test('인증 없으면 401을 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav', { method: 'PROPFIND' })
            expect(res.status).toBe(401)
            expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="CalDAV"')
        })

        test('Basic Auth로 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })

        test('trailing slash PROPFIND도 동작한다', async () => {
            const app = createApp()
            const res = await app.request('/.well-known/caldav/', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })
    })
})

describe('Basic Auth 토큰 추출', () => {
    test('token 쿼리가 Basic Auth보다 우선한다', async () => {
        const app = createApp()
        const res = await app.request(`/.well-known/caldav?token=query-token`, {
            headers: { Authorization: toBasicAuth('user', 'auth-token') },
            redirect: 'manual',
        })
        expect(res.status).toBe(301)
        expect(res.headers.get('Location')).toBe('/caldav/query-token/')
    })

    test('잘못된 Basic Auth 형식이면 401을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: 'Basic ???invalid-base64???' },
        })
        expect(res.status).toBe(401)
    })

    test('Basic이 아닌 인증 스킴이면 401을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: 'Bearer some-token' },
        })
        expect(res.status).toBe(401)
    })

    test('콜론 없는 Base64 값이면 401을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: `Basic ${btoa('no-colon-here')}` },
        })
        expect(res.status).toBe(401)
    })

    test('빈 password면 빈 문자열 토큰으로 리다이렉트한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: toBasicAuth('user', '') },
            redirect: 'manual',
        })
        expect(res.status).toBe(401)
    })

    test('password에 콜론이 포함되어도 전체를 토큰으로 추출한다', async () => {
        const tokenWithColon = 'token:with:colons'
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: toBasicAuth('user', tokenWithColon) },
            redirect: 'manual',
        })
        expect(res.status).toBe(301)
        expect(res.headers.get('Location')).toBe(`/caldav/${tokenWithColon}/`)
    })

    test('Authorization 헤더가 "Basic "만 있으면 401을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav', {
            headers: { Authorization: 'Basic ' },
        })
        expect(res.status).toBe(401)
    })

    test('401 응답 바디에 Unauthorized 텍스트를 포함한다', async () => {
        const app = createApp()
        const res = await app.request('/.well-known/caldav')
        const body = await res.text()
        expect(body).toBe('Unauthorized')
    })
})

describe('CalDAV fallback 경로', () => {
    describe('PROPFIND /', () => {
        test('인증 없으면 401을 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/', { method: 'PROPFIND' })
            expect(res.status).toBe(401)
            expect(res.headers.get('WWW-Authenticate')).toBe('Basic realm="CalDAV"')
        })

        test('Basic Auth로 /caldav/:token/으로 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request('/', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })
    })

    describe('PROPFIND /principals/', () => {
        test('인증 없으면 401을 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/principals/', { method: 'PROPFIND' })
            expect(res.status).toBe(401)
        })

        test('Basic Auth로 리다이렉트한다', async () => {
            const app = createApp()
            const res = await app.request('/principals/', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })
    })

    describe('PROPFIND /principals/*', () => {
        test('하위 경로도 처리한다', async () => {
            const app = createApp()
            const res = await app.request('/principals/users/user/', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })
    })

    describe('PROPFIND /calendar/dav/*', () => {
        test('macOS가 시도하는 /calendar/dav/user/user/ 경로를 처리한다', async () => {
            const app = createApp()
            const res = await app.request('/calendar/dav/user/user/', {
                method: 'PROPFIND',
                headers: { Authorization: toBasicAuth('user', TOKEN) },
                redirect: 'manual',
            })
            expect(res.status).toBe(301)
            expect(res.headers.get('Location')).toBe(`/caldav/${TOKEN}/`)
        })

        test('인증 없으면 401을 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/calendar/dav/user/user/', { method: 'PROPFIND' })
            expect(res.status).toBe(401)
        })
    })
})

describe('GET /는 기존 홈페이지를 반환한다', () => {
    test('PROPFIND가 아닌 GET 요청은 홈페이지를 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/html')
    })
})
