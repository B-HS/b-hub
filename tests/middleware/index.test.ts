import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createMiddleware } from '../../middleware/index'
import type { AuthContext } from '../../lib/hono-types'

const createApp = (allowedDomains: string[] = ['gumyo.net', 'hyns.dev']) => {
    const app = new Hono<AuthContext>()
    createMiddleware(app, { allowedDomains })
    app.get('/api/test', (c) => c.json({ ok: true }))
    app.get('/other', (c) => c.json({ ok: true }))
    return app
}

describe('createMiddleware', () => {
    describe('CORS - isAllowedOrigin', () => {
        test('허용된 도메인의 origin을 허용한다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                headers: { Origin: 'https://gumyo.net' },
            })
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://gumyo.net')
        })

        test('서브도메인도 허용한다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                headers: { Origin: 'https://api.gumyo.net' },
            })
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://api.gumyo.net')
        })

        test('허용되지 않은 도메인은 빈 문자열을 반환한다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                headers: { Origin: 'https://evil.com' },
            })
            const origin = res.headers.get('Access-Control-Allow-Origin')
            expect(!origin || origin === '').toBe(true)
        })

        test('잘못된 URL 형식은 거부한다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                headers: { Origin: 'not-a-url' },
            })
            const origin = res.headers.get('Access-Control-Allow-Origin')
            expect(!origin || origin === '').toBe(true)
        })
    })

    describe('미들웨어 구성', () => {
        test('/api/* 경로에 CORS 헤더가 설정된다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                method: 'OPTIONS',
                headers: {
                    'Origin': 'https://gumyo.net',
                    'Access-Control-Request-Method': 'GET',
                },
            })
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://gumyo.net')
        })

        test('credentials가 true로 설정된다', async () => {
            const app = createApp()
            const res = await app.request('/api/test', {
                headers: { Origin: 'https://gumyo.net' },
            })
            expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
        })

        test('에러 핸들러가 동작한다', async () => {
            const app = new Hono<AuthContext>()
            createMiddleware(app, { allowedDomains: ['gumyo.net'] })
            app.get('/api/error', () => {
                throw new Error('test error')
            })
            const res = await app.request('/api/error')
            expect(res.status).toBe(500)
        })
    })
})
