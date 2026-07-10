import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageMailMessagesRoute } from '../../../page/manage/pages/mail-messages'
import type { MailMessageService } from '../../../service/domain/mail/mail-message'
import { mockUser, sessionOf, stubMailAccountService, stubMailFolderDb, stubMailMessageService, stubMailUploadService } from './helpers'

const sampleMessage = {
    id: 42,
    accountId: 3,
    folderId: 5,
    subject: '안녕하세요',
    snippet: '본문 미리보기',
    fromAddress: { name: '보낸이', address: 'sender@x.com' },
    toAddresses: [{ name: '', address: 'me@y.com' }],
    ccAddresses: [],
    bccAddresses: [],
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false,
    bodyHtml: '<b>secret-html</b>',
    bodyText: '평문 본문',
    receivedAt: new Date('2026-05-01'),
    sentAt: new Date('2026-05-01'),
    attachments: [],
}

const createApp = (overrides: Partial<MailMessageService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/mail/messages',
        createManageMailMessagesRoute({
            getSession: sessionOf(mockUser),
            mailMessageService: stubMailMessageService(overrides),
            mailAccountService: stubMailAccountService(),
            mailFolderDb: stubMailFolderDb(),
            mailUploadService: stubMailUploadService(),
        }),
    )
    return app
}

describe('GET /manage/mail/messages', () => {
    test('검색어가 없으면 list를 호출한다', async () => {
        const list = mock(() => Promise.resolve({ data: [sampleMessage], total: 1 }))
        const res = await createApp({ list: list as never }).request('/manage/mail/messages')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('안녕하세요')
        expect(list).toHaveBeenCalledTimes(1)
    })

    test('검색어가 있으면 search를 호출한다', async () => {
        const search = mock(() => Promise.resolve({ data: [], total: 0 }))
        const res = await createApp({ search: search as never }).request('/manage/mail/messages?q=hello')
        expect(res.status).toBe(200)
        expect(search).toHaveBeenCalledTimes(1)
    })
})

describe('GET /manage/mail/messages/:id', () => {
    test('상세에서 평문 본문은 보이고 HTML 본문은 렌더링하지 않는다', async () => {
        const res = await createApp({ getById: () => Promise.resolve(sampleMessage) as never }).request('/manage/mail/messages/42')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('평문 본문')
        expect(html).not.toContain('secret-html')
    })
})

describe('POST /manage/mail/messages 액션', () => {
    test('mark-read는 messageId 배열로 markRead를 호출한다', async () => {
        const markRead = mock(() => Promise.resolve())
        const res = await createApp({ markRead }).request('/manage/mail/messages/mark-read', {
            method: 'POST',
            body: new URLSearchParams({ messageId: '42' }),
        })
        expect(res.status).toBe(303)
        expect(markRead).toHaveBeenCalledWith('u1', [42])
    })

    test('send는 to를 파싱해 send를 호출한다', async () => {
        const send = mock(() => Promise.resolve({ messageId: 'm1' }))
        const res = await createApp({ send: send as never }).request('/manage/mail/messages/send', {
            method: 'POST',
            body: new URLSearchParams({ accountId: '3', to: 'a@x.com, b@y.com', subject: '제목', bodyText: '내용' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/mail/messages?flash=ok')
        expect(send).toHaveBeenCalledTimes(1)
        const [userId, accountId, data] = send.mock.calls[0] as unknown as [string, number, { to: { address: string }[] }]
        expect(userId).toBe('u1')
        expect(accountId).toBe(3)
        expect(data.to.map((t) => t.address)).toEqual(['a@x.com', 'b@y.com'])
    })

    test('reply는 reply를 호출하고 상세로 리다이렉트한다', async () => {
        const reply = mock(() => Promise.resolve({ messageId: 'm1' }))
        const res = await createApp({ reply: reply as never }).request('/manage/mail/messages/42/reply', {
            method: 'POST',
            body: new URLSearchParams({ bodyText: '답장' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/mail/messages/42?flash=ok')
        expect(reply).toHaveBeenCalledTimes(1)
    })

    test('mark-all-read는 account/folder 없으면 검증 실패한다', async () => {
        const markAllRead = mock(() => Promise.resolve({ updated: 0 }))
        const res = await createApp({ markAllRead: markAllRead as never }).request('/manage/mail/messages/mark-all-read', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
        expect(markAllRead).not.toHaveBeenCalled()
    })
})
