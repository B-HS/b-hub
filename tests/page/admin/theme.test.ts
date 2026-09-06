import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { sanitizeTheme } from '../../../page/admin/theme'
import { createAdminRoute } from '../../../page/admin'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const createApp = () => {
    const app = new Hono()
    app.route('/admin', createAdminRoute({ getSession: sessionOf(mockAdmin), adminDb: stubAdminDb(), csrfSecret: 'test-csrf-secret' }))
    return app
}

describe('sanitizeTheme', () => {
    test('light 는 그대로 유지된다', () => {
        expect(sanitizeTheme('light')).toBe('light')
    })

    test('dark 와 알 수 없는 값은 dark 로 정규화된다', () => {
        expect(sanitizeTheme('dark')).toBe('dark')
        expect(sanitizeTheme('weird')).toBe('dark')
        expect(sanitizeTheme(undefined)).toBe('dark')
    })
})

describe('GET /admin/theme', () => {
    test('테마 쿠키를 설정하고 returnTo 로 리다이렉트한다', async () => {
        const res = await createApp().request('/admin/theme?to=dark&returnTo=/admin/users')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin/users')
        expect(res.headers.get('set-cookie')).toContain('admin_theme=dark')
    })

    test('admin 외부 returnTo 는 /admin 으로 대체된다', async () => {
        const res = await createApp().request('/admin/theme?to=light&returnTo=https://evil.example.com')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/admin')
        expect(res.headers.get('set-cookie')).toContain('admin_theme=light')
    })
})

describe('서버 렌더 data-theme', () => {
    test('admin_theme 쿠키가 dark 이면 html 에 data-theme="dark" 가 붙는다', async () => {
        const res = await createApp().request('/admin/blog/categories', { headers: { Cookie: 'admin_theme=dark' } })
        const html = await res.text()
        expect(html).toContain('data-theme="dark"')
    })

    test('쿠키가 없으면 data-theme 속성이 없다 (시스템 기본)', async () => {
        const res = await createApp().request('/admin/blog/categories')
        const html = await res.text()
        expect(html).not.toContain('data-theme=')
    })
})
