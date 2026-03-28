import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { policyRoute } from '../../page/policy'
import { PRIVACY_POLICY } from '../../lib/privacy-policy'
import { TERMS_OF_SERVICE } from '../../lib/terms-of-service'

const createApp = () => {
    const app = new Hono()
    app.route('/policy', policyRoute)
    return app
}

describe('GET /policy', () => {
    test('200 상태와 HTML을 반환한다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toContain('text/html')
    })

    test('개인정보처리방침 제목이 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        expect(html).toContain(PRIVACY_POLICY.title)
    })

    test('서비스 이용약관 제목이 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        expect(html).toContain(TERMS_OF_SERVICE.title)
    })

    test('모든 개인정보처리방침 섹션이 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        for (const section of PRIVACY_POLICY.sections) {
            expect(html).toContain(section.heading)
        }
    })

    test('모든 서비스 이용약관 섹션이 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        for (const section of TERMS_OF_SERVICE.sections) {
            expect(html).toContain(section.heading)
        }
    })

    test('최종 업데이트 날짜가 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        expect(html).toContain(PRIVACY_POLICY.lastUpdated)
        expect(html).toContain(TERMS_OF_SERVICE.lastUpdated)
    })

    test('문의처 이메일이 포함된다', async () => {
        const app = createApp()
        const res = await app.request('/policy')
        const html = await res.text()
        expect(html).toContain('hs@gumyo.net')
    })
})
