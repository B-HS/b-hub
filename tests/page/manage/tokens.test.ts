import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageTokensRoute } from '../../../page/manage/pages/tokens'
import type { ApiTokenService } from '../../../service/shared/api-token'
import { mockUser, sessionOf, stubApiTokenService } from './helpers'

const sampleToken = {
    id: 7,
    userId: 'u1',
    token: 'hashed-value',
    name: 'CLI',
    expiresAt: new Date('2026-12-31'),
    lastUsedAt: new Date('2026-05-20'),
    createdAt: new Date('2026-05-01'),
}

const createApp = (overrides: Partial<ApiTokenService> = {}) => {
    const app = new Hono()
    app.route('/manage/tokens', createManageTokensRoute({ getSession: sessionOf(mockUser), apiTokenService: stubApiTokenService(overrides) }))
    return app
}

describe('GET /manage/tokens', () => {
    test('토큰 이름을 보여주고 해시 원문은 노출하지 않는다', async () => {
        const res = await createApp({ listByUser: () => Promise.resolve([sampleToken]) }).request('/manage/tokens')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('CLI')
        expect(html).not.toContain('hashed-value')
    })

    test('AI 채팅 프로그램 접근 안내 문구를 포함한다', async () => {
        const res = await createApp().request('/manage/tokens')
        const html = await res.text()
        expect(html).toContain('AI 채팅')
    })
})

describe('POST /manage/tokens', () => {
    test('create를 호출하고 발급된 토큰을 1회 노출한다', async () => {
        const create = mock(() => Promise.resolve('brand-new-token'))
        const app = createApp({ create })
        const res = await app.request('/manage/tokens', { method: 'POST', body: new URLSearchParams({ name: 'CLI' }) })
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('brand-new-token')
        expect(html).toContain('다시 표시되지 않습니다')
        expect(create).toHaveBeenCalledWith('u1', 'CLI')
    })

    test('이름이 비면 undefined로 발급한다', async () => {
        const create = mock(() => Promise.resolve('t'))
        const app = createApp({ create })
        await app.request('/manage/tokens', { method: 'POST', body: new URLSearchParams({ name: '   ' }) })
        expect(create).toHaveBeenCalledWith('u1', undefined)
    })
})

describe('POST /manage/tokens/:id/delete', () => {
    test('revokeById를 정수 id로 호출하고 303을 반환한다', async () => {
        const revokeById = mock(() => Promise.resolve())
        const app = createApp({ revokeById })
        const res = await app.request('/manage/tokens/7/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/tokens?flash=ok')
        expect(revokeById).toHaveBeenCalledWith('u1', 7)
    })

    test('잘못된 id는 revokeById를 호출하지 않지만 303을 반환한다', async () => {
        const revokeById = mock(() => Promise.resolve())
        const app = createApp({ revokeById })
        const res = await app.request('/manage/tokens/abc/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(revokeById).not.toHaveBeenCalled()
    })
})
