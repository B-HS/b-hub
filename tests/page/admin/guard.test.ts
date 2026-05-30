import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requireAdminPage, type AdminContext } from '../../../page/admin/guard'

const mockAdmin = { id: 'a1', name: 'Admin', email: 'admin@example.com', role: 'admin', image: null }
const mockUser = { id: 'u1', name: 'User', email: 'user@example.com', role: 'user', image: null }

const createApp = (getSession: Parameters<typeof requireAdminPage>[0]) => {
    const app = new Hono<AdminContext>()
    app.use('*', requireAdminPage(getSession))
    app.get('/test', (c) => c.html(`<p>${c.get('adminUser').email}</p>`))
    return app
}

describe('requireAdminPage middleware', () => {
    test('미인증 사용자는 /admin/login으로 리다이렉트한다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/login')
        expect(res.headers.get('location')).toContain('next=')
    })

    test('next 쿼리에 현재 경로가 포함된다', async () => {
        const getSession = mock(() => Promise.resolve(null))
        const res = await createApp(getSession).request('/test?foo=bar')
        const location = res.headers.get('location') ?? ''
        expect(decodeURIComponent(location)).toContain('/test?foo=bar')
    })

    test('비관리자는 403 HTML을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockUser }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(403)
        expect(res.headers.get('Content-Type')).toContain('text/html')
        const html = await res.text()
        expect(html).toContain('user@example.com')
    })

    test('role이 null이면 403을 반환한다', async () => {
        const getSession = mock(() => Promise.resolve({ user: { ...mockUser, role: null } }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(403)
    })

    test('관리자는 200 응답을 받는다', async () => {
        const getSession = mock(() => Promise.resolve({ user: mockAdmin }))
        const res = await createApp(getSession).request('/test')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('admin@example.com')
    })
})
