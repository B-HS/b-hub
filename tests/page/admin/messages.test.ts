import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMessagesRoute } from '../../../page/admin/pages/messages'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleRow = {
    id: 'm-1',
    userId: 'u-1',
    userEmail: 'author@example.com',
    body: '안녕하세요 첫 메시지입니다',
    createdAt: new Date('2026-05-01'),
    deletedAt: null,
    replyToId: null,
    retweetOfId: null,
    likesCount: 7,
    bookmarksCount: 3,
}

const sampleDetail = {
    id: 'm-1',
    userId: 'u-1',
    userEmail: 'author@example.com',
    body: '상세 본문 텍스트',
    createdAt: new Date('2026-05-01'),
    deletedAt: null,
    replyToId: null,
    retweetOfId: null,
}

const sampleFollow = {
    followerId: 'follower-aaaaaaaaaaaaaa',
    followingId: 'following-bbbbbbbbbbbbb',
    createdAt: new Date('2026-05-02'),
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/messages',
        createMessagesRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listMessages: () => Promise.resolve({ rows: [sampleRow], total: 1 }),
                listFollows: () => Promise.resolve({ rows: [sampleFollow], total: 1 }),
                getMessage: (id) => Promise.resolve(id === sampleDetail.id ? sampleDetail : null),
                getMessageImages: () =>
                    Promise.resolve([{ imageId: 'img-1', order: 0, r2Key: 'messages/x.png', mimeType: 'image/png' }]),
                getMessageLikes: () => Promise.resolve([{ userId: 'u-2', userEmail: 'liker@example.com', createdAt: new Date('2026-05-03') }]),
                getMessageBookmarks: () => Promise.resolve([{ userId: 'u-3', userEmail: 'marker@example.com', createdAt: new Date('2026-05-04') }]),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/messages (목록)', () => {
    test('200과 본문/카운트를 노출한다', async () => {
        const res = await createApp().request('/admin/messages')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('안녕하세요 첫 메시지입니다')
        expect(html).toContain('author@example.com')
        expect(html).toContain('7')
        expect(html).toContain('3')
        expect(html).toContain('1–1 / 1')
    })

    test('q 필터가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/messages?q=hello')
        const html = await res.text()
        expect(html).toContain('value="hello"')
    })

    test('includeDeleted 필터가 select에 prefill 된다', async () => {
        const captured: { includeDeleted?: string } = {}
        const listMessages = mock((arg: { includeDeleted?: string }) => {
            captured.includeDeleted = arg.includeDeleted
            return Promise.resolve({ rows: [sampleRow], total: 1 })
        })
        const res = await createApp({ listMessages }).request('/admin/messages?includeDeleted=y')
        const html = await res.text()
        expect(captured.includeDeleted).toBe('y')
        expect(html).toContain('selected')
    })

    test('size는 5~200 범위로 클램프된다', async () => {
        const captured: number[] = []
        const listMessages = mock((arg: { size: number }) => {
            captured.push(arg.size)
            return Promise.resolve({ rows: [sampleRow], total: 1 })
        })
        const app = createApp({ listMessages })
        await app.request('/admin/messages?size=1')
        await app.request('/admin/messages?size=9999')
        expect(captured[0]).toBe(5)
        expect(captured[1]).toBe(200)
    })

    test('잘못된 page 값은 1로 폴백되고 크래시하지 않는다', async () => {
        const captured: number[] = []
        const listMessages = mock((arg: { page: number }) => {
            captured.push(arg.page)
            return Promise.resolve({ rows: [sampleRow], total: 1 })
        })
        const res = await createApp({ listMessages }).request('/admin/messages?page=abc')
        expect(res.status).toBe(200)
        expect(captured[0]).toBe(1)
    })
})

describe('POST /admin/messages/:id/delete', () => {
    test('softDeleteMessage가 호출되고 303 flash=ok로 리다이렉트한다', async () => {
        const softDeleteMessage = mock(() => Promise.resolve())
        const app = createApp({ softDeleteMessage })
        const res = await app.request('/admin/messages/m-1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/messages')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(softDeleteMessage).toHaveBeenCalledWith('m-1')
    })

    test('returnTo가 외부 URL이면 무시하고 기본 경로로 폴백한다', async () => {
        const softDeleteMessage = mock(() => Promise.resolve())
        const app = createApp({ softDeleteMessage })
        const res = await app.request('/admin/messages/m-1/delete', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toBe('/admin/messages?flash=ok')
    })

    test('returnTo가 /admin 경로면 존중된다', async () => {
        const softDeleteMessage = mock(() => Promise.resolve())
        const app = createApp({ softDeleteMessage })
        const res = await app.request('/admin/messages/m-1/delete', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: '/admin/messages?page=2&size=30' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/admin/messages?page=2&size=30')
        expect(location).toContain('flash=ok')
    })
})

describe('POST /admin/messages/:id/restore', () => {
    test('restoreMessage가 호출되고 303으로 리다이렉트한다', async () => {
        const restoreMessage = mock(() => Promise.resolve())
        const app = createApp({ restoreMessage })
        const res = await app.request('/admin/messages/m-1/restore', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(restoreMessage).toHaveBeenCalledWith('m-1')
    })
})

describe('GET /admin/messages/follows', () => {
    test('팔로우 그래프 목록이 노출된다', async () => {
        const res = await createApp().request('/admin/messages/follows')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Follows')
        expect(html).toContain('follower-aaa')
        expect(html).toContain('1–1 / 1')
    })
})

describe('GET /admin/messages/:id (상세)', () => {
    test('상세 페이지에 본문과 각 섹션이 렌더된다', async () => {
        const res = await createApp().request('/admin/messages/m-1')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('상세 본문 텍스트')
        expect(html).toContain('첨부 이미지')
        expect(html).toContain('messages/x.png')
        expect(html).toContain('좋아요')
        expect(html).toContain('liker@example.com')
        expect(html).toContain('북마크')
        expect(html).toContain('marker@example.com')
    })

    test('getMessage가 null이면 404를 반환한다', async () => {
        const res = await createApp().request('/admin/messages/missing')
        expect(res.status).toBe(404)
    })
})
