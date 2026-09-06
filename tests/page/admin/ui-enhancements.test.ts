import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { createAdminRoute } from '../../../page/admin'
import { ADMIN_CONFIRM_SCRIPT } from '../../../page/admin/components'
import { securityHeaders } from '../../../middleware/security-headers'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const samplePost = {
    postId: 1,
    title: 'Hello World',
    categoryId: 1,
    categoryName: '일상',
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    views: 100,
    isPublished: true,
    isHide: false,
    isNotice: false,
    isComment: true,
}

const createApp = () => {
    const app = new Hono()
    app.route(
        '/admin',
        createAdminRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({ listPosts: () => Promise.resolve({ rows: [samplePost], total: 100 }) }),
            csrfSecret: 'test-csrf-secret',
        }),
    )
    return app
}

describe('Pagination 개선', () => {
    test('처음·이전·다음·끝 네비게이션이 렌더링된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('처음')
        expect(html).toContain('이전')
        expect(html).toContain('다음')
        expect(html).toContain('끝')
    })

    test('페이지 크기 프리셋(20/50/100)이 노출된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('표시')
        expect(html).toContain('페이지당 50개')
        expect(html).toContain('페이지당 100개')
    })

    test('현재 페이지가 aria-current 로 표시된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('aria-current="page"')
        expect(html).toContain('aria-label="처음 페이지"')
    })
})

describe('파괴적 액션 confirm', () => {
    test('삭제 폼에 data-confirm 속성이 부여된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('data-confirm=')
        expect(html).toContain('이 작업은 되돌릴 수 없습니다')
    })

    test('confirm 위임 스크립트가 페이지에 주입된다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain("addEventListener('submit'")
    })

    test('admin HTML CSP 의 script-src 해시가 실제 confirm 스크립트와 일치한다', async () => {
        const expected = 'sha256-' + createHash('sha256').update(ADMIN_CONFIRM_SCRIPT, 'utf8').digest('base64')
        const app = new Hono()
        app.use('*', securityHeaders({ htmlPaths: ['/admin'] }))
        app.get('/admin/x', (c) => c.html('<html></html>'))
        const csp = (await app.request('/admin/x')).headers.get('Content-Security-Policy') ?? ''
        expect(csp).toContain(`script-src '${expected}'`)
    })
})

describe('테마 토글', () => {
    test('상단바에 테마 전환 링크가 있다', async () => {
        const html = await (await createApp().request('/admin/blog/posts')).text()
        expect(html).toContain('/admin/theme?to=')
        expect(html).toContain('테마 전환')
    })
})
