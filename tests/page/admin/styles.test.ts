import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createAdminRoute } from '../../../page/admin'

const mockGetSession = () => Promise.resolve(null)
const stubDb = {} as never

const createApp = () => {
    const app = new Hono()
    app.route('/admin', createAdminRoute({ getSession: mockGetSession, db: stubDb, csrfSecret: 'test-csrf-secret' }))
    return app
}

describe('GET /admin/styles.css', () => {
    test('200 상태와 CSS Content-Type을 반환한다', async () => {
        const res = await createApp().request('/admin/styles.css')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/css')
    })

    test('Cache-Control 헤더가 설정된다', async () => {
        const res = await createApp().request('/admin/styles.css')
        expect(res.headers.get('Cache-Control')).toContain('max-age')
    })

    test('주요 디자인 토큰들이 포함된다', async () => {
        const res = await createApp().request('/admin/styles.css')
        const css = await res.text()
        expect(css).toContain('--color-primary')
        expect(css).toContain('--color-background')
        expect(css).toContain('--color-destructive')
        expect(css).toContain('--radius')
        expect(css).toContain('--font-sans')
    })

    test('어드민 UI 클래스 정의가 포함된다', async () => {
        const res = await createApp().request('/admin/styles.css')
        const css = await res.text()
        expect(css).toContain('.sidebar')
        expect(css).toContain('.topbar')
        expect(css).toContain('.btn')
        expect(css).toContain('.badge')
        expect(css).toContain('.t ')
    })

    test('다크 모드 미디어 쿼리가 포함된다', async () => {
        const res = await createApp().request('/admin/styles.css')
        const css = await res.text()
        expect(css).toContain('prefers-color-scheme: dark')
    })
})
