import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailMessageRoute } from '../../../route/mail/message'

const createMockDeps = () => ({
    mailMessageService: {
        list: mock(() => Promise.resolve({ data: [], total: 0 })),
        getById: mock(() => Promise.resolve({ id: 1 })),
        getThread: mock(() => Promise.resolve([])),
        markRead: mock(() => Promise.resolve()),
        markUnread: mock(() => Promise.resolve()),
        markStarred: mock(() => Promise.resolve()),
        unmarkStarred: mock(() => Promise.resolve()),
        moveToFolder: mock(() => Promise.resolve()),
        deleteMessages: mock(() => Promise.resolve()),
        search: mock(() => Promise.resolve({ data: [], total: 0 })),
        downloadAttachment: mock(() => Promise.resolve({ content: Buffer.from('data'), filename: 'file.pdf', mimeType: 'application/pdf' })),
        send: mock(() => Promise.resolve({ messageId: 'sent-1' })),
        reply: mock(() => Promise.resolve({ messageId: 'reply-1' })),
        forward: mock(() => Promise.resolve({ messageId: 'fwd-1' })),
        getSenderList: mock(() =>
            Promise.resolve([
                { address: 'alice@test.com', name: 'Alice' },
                { address: 'bob@test.com', name: 'Bob' },
            ]),
        ),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/mail/messages', createMailMessageRoute(deps))
    return { app, deps }
}

describe('GET /mail/messages', () => {
    test('메시지 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/messages')
        expect(res.status).toBe(401)
    })
})

describe('GET /mail/messages/search', () => {
    test('검색 결과를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/search?q=hello')
        expect(res.status).toBe(200)
    })

    test('q 없이 필터만으로 검색하면 200을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/messages/search?isStarred=true')
        expect(res.status).toBe(200)
        expect(deps.mailMessageService.search).toHaveBeenCalledWith('user-1', expect.objectContaining({ isStarred: true, excludeJunk: true }))
        expect(deps.mailMessageService.search.mock.calls[0][1].q).toBeUndefined()
    })

    test('구조화 필터를 파싱해 서비스로 전달한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request(
            '/mail/messages/search?q=hi&accountId=2&folderId=5&fromAddress=alice&toAddress=bob&hasAttachment=true&isRead=false&isStarred=true&excludeJunk=false&dateFrom=2024-01-01T00:00:00.000Z&dateTo=2024-02-01T00:00:00.000Z',
        )
        expect(res.status).toBe(200)
        const call = deps.mailMessageService.search.mock.calls[0][1]
        expect(call).toMatchObject({
            q: 'hi',
            accountId: 2,
            folderId: 5,
            fromAddress: 'alice',
            toAddress: 'bob',
            hasAttachment: true,
            isRead: false,
            isStarred: true,
            excludeJunk: false,
        })
        expect(call.dateFrom).toBeInstanceOf(Date)
        expect(call.dateTo).toBeInstanceOf(Date)
    })

    test('잘못된 excludeJunk 값은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/search?excludeJunk=maybe')
        expect(res.status).toBe(400)
    })
})

describe('GET /mail/messages/senders', () => {
    test('발신자 목록을 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/messages/senders')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
        expect(body.data[0].address).toBe('alice@test.com')
        expect(deps.mailMessageService.getSenderList).toHaveBeenCalledWith('user-1', { limit: 10000 })
    })

    test('accountId와 limit 쿼리를 전달한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/messages/senders?accountId=3&limit=500')
        expect(res.status).toBe(200)
        expect(deps.mailMessageService.getSenderList).toHaveBeenCalledWith('user-1', { accountId: 3, limit: 500 })
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/messages/senders')
        expect(res.status).toBe(401)
    })

    test('limit 0은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/senders?limit=0')
        expect(res.status).toBe(400)
    })

    test('limit 10001은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/senders?limit=10001')
        expect(res.status).toBe(400)
    })

    test('accountId가 음수이면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/senders?accountId=-1')
        expect(res.status).toBe(400)
    })
})

describe('GET /mail/messages/:messageId', () => {
    test('메시지 상세를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1')
        expect(res.status).toBe(200)
    })

    test('메시지가 없으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.mailMessageService.getById = mock(() => {
            const err = { code: 'MAIL_MESSAGE_NOT_FOUND', message: 'Not found', statusCode: 404 }
            return Promise.reject(err)
        })
        const { app } = createApp(deps)
        const res = await app.request('/mail/messages/999')
        expect(res.status).toBe(404)
    })

    test('인증 없이 요청하면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/messages/1')
        expect(res.status).toBe(401)
    })
})

describe('POST /mail/messages/mark-read', () => {
    test('읽음 표시한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds: [1, 2] }),
        })
        expect(res.status).toBe(200)
    })

    test('빈 messageIds는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds: [] }),
        })
        expect(res.status).toBe(400)
    })
})

describe('POST /mail/messages/mark-unread', () => {
    test('안읽음 표시한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/mark-unread', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds: [1] }),
        })
        expect(res.status).toBe(200)
    })
})

describe('POST /mail/messages/send', () => {
    test('메일을 발송한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId: 1,
                to: [{ name: 'To', address: 'to@test.com' }],
                subject: 'Hello',
                bodyText: 'Hi',
            }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.messageId).toBe('sent-1')
    })

    test('잘못된 요청은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1, to: [], subject: 'Hi' }),
        })
        expect(res.status).toBe(400)
    })
})

describe('POST /mail/messages/:messageId/reply', () => {
    test('답장한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bodyHtml: '<p>Reply</p>' }),
        })
        expect(res.status).toBe(200)
    })
})

describe('발송 rate limit', () => {
    const createLimitedApp = (allowed: boolean) => {
        const checkLimit = mock(() => ({ allowed, limit: 20, remaining: allowed ? 19 : 0, resetAt: 1_700_000_000_000 }))
        const app = new Hono()
        app.route('/mail/messages', createMailMessageRoute({ ...createMockDeps(), checkLimit }))
        return { app, checkLimit }
    }

    test('reply 는 send 와 같은 한도 키로 X-RateLimit 헤더를 붙인다', async () => {
        const { app, checkLimit } = createLimitedApp(true)
        const res = await app.request('/mail/messages/1/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bodyHtml: '<p>Reply</p>' }),
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('X-RateLimit-Limit')).toBe('20')
        expect(res.headers.get('X-RateLimit-Remaining')).toBe('19')
        expect(checkLimit).toHaveBeenCalledWith('user-1', 'mail:messages:send')
    })

    test('forward 는 send 와 같은 한도 키로 X-RateLimit 헤더를 붙인다', async () => {
        const { app, checkLimit } = createLimitedApp(true)
        const res = await app.request('/mail/messages/1/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: [{ name: 'Fwd', address: 'fwd@test.com' }] }),
        })
        expect(res.status).toBe(200)
        expect(checkLimit).toHaveBeenCalledWith('user-1', 'mail:messages:send')
    })

    test('send 도 같은 한도 키를 쓴다', async () => {
        const { app, checkLimit } = createLimitedApp(true)
        const res = await app.request('/mail/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1, to: [{ name: 'To', address: 'to@test.com' }], subject: 'Hello', bodyText: 'Hi' }),
        })
        expect(res.status).toBe(200)
        expect(checkLimit).toHaveBeenCalledWith('user-1', 'mail:messages:send')
    })

    test('한도를 넘으면 reply 와 forward 는 429 를 반환한다', async () => {
        const { app } = createLimitedApp(false)
        const reply = await app.request('/mail/messages/1/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bodyHtml: '<p>Reply</p>' }),
        })
        const forward = await app.request('/mail/messages/1/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: [{ name: 'Fwd', address: 'fwd@test.com' }] }),
        })
        expect(reply.status).toBe(429)
        expect(forward.status).toBe(429)
        expect((await reply.json()).error.code).toBe('RATE_LIMIT_EXCEEDED')
    })
})

describe('POST /mail/messages/:messageId/forward', () => {
    test('전달한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: [{ name: 'Fwd', address: 'fwd@test.com' }] }),
        })
        expect(res.status).toBe(200)
    })
})

describe('GET /mail/messages/:messageId/attachments/:attachmentId', () => {
    test('첨부파일을 다운로드한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1/attachments/10')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('application/pdf')
    })

    test('다운로드 응답은 attachment 강제 + nosniff 헤더를 붙인다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1/attachments/10')
        expect(res.headers.get('Content-Disposition')?.startsWith('attachment;')).toBe(true)
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    test('잘못된 messageId는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/abc/attachments/10')
        expect(res.status).toBe(400)
    })

    test('잘못된 attachmentId는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/1/attachments/xyz')
        expect(res.status).toBe(400)
    })

    test('음수 messageId는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/messages/-1/attachments/10')
        expect(res.status).toBe(400)
    })
})
