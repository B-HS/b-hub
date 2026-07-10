import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { issueCsrfToken, verifyCsrfToken } from '../../../page/admin/csrf'
import { createAdminRoute } from '../../../page/admin'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const SECRET = 'test-csrf-secret'
const TOKEN = issueCsrfToken(mockAdmin.id, SECRET)

describe('csrf 토큰', () => {
    test('같은 세션키·시크릿은 항상 같은 토큰을 만든다', () => {
        expect(issueCsrfToken('u1', SECRET)).toBe(issueCsrfToken('u1', SECRET))
    })

    test('유효한 토큰은 검증을 통과한다', () => {
        expect(verifyCsrfToken(TOKEN, mockAdmin.id, SECRET)).toBe(true)
    })

    test('세션키가 다르면 검증에 실패한다', () => {
        expect(verifyCsrfToken(TOKEN, 'other', SECRET)).toBe(false)
    })

    test('시크릿이 다르면 검증에 실패한다', () => {
        expect(verifyCsrfToken(TOKEN, mockAdmin.id, 'wrong')).toBe(false)
    })

    test('빈 값·비문자열은 검증에 실패한다', () => {
        expect(verifyCsrfToken('', mockAdmin.id, SECRET)).toBe(false)
        expect(verifyCsrfToken(undefined, mockAdmin.id, SECRET)).toBe(false)
    })
})

const createApp = (csrfSecret?: string) => {
    const app = new Hono()
    app.route('/admin', createAdminRoute({ getSession: sessionOf(mockAdmin), adminDb: stubAdminDb(), csrfSecret }))
    return app
}

describe('createAdminRoute CSRF 가드', () => {
    test('시크릿이 있으면 폼에 _csrf 히든 토큰이 렌더링된다', async () => {
        const res = await createApp(SECRET).request('/admin/blog/categories')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('name="_csrf"')
        expect(html).toContain(TOKEN)
    })

    test('유효한 토큰을 포함한 POST 는 통과한다', async () => {
        const res = await createApp(SECRET).request('/admin/blog/categories', {
            method: 'POST',
            body: new URLSearchParams({ name: 'news', _csrf: TOKEN }),
        })
        expect(res.status).toBe(303)
    })

    test('토큰이 없는 POST 는 403 을 반환한다', async () => {
        const res = await createApp(SECRET).request('/admin/blog/categories', {
            method: 'POST',
            body: new URLSearchParams({ name: 'news' }),
        })
        expect(res.status).toBe(403)
    })

    test('토큰이 틀린 POST 는 403 을 반환한다', async () => {
        const res = await createApp(SECRET).request('/admin/blog/categories', {
            method: 'POST',
            body: new URLSearchParams({ name: 'news', _csrf: 'deadbeef' }),
        })
        expect(res.status).toBe(403)
    })

    test('시크릿이 없으면 CSRF 검증이 비활성화된다', async () => {
        const res = await createApp().request('/admin/blog/categories', {
            method: 'POST',
            body: new URLSearchParams({ name: 'news' }),
        })
        expect(res.status).toBe(303)
    })
})
