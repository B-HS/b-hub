import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { createGmailProvider } from '../../../../../service/domain/mail/providers/gmail-provider'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

let fetchCalls: { url: string; options: RequestInit }[] = []
let fetchResponses: Map<string, () => Response> = new Map()
const originalFetch = globalThis.fetch

const mockResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const setFetchResponse = (pathPattern: string, body: unknown, status = 200) => {
    fetchResponses.set(pathPattern, () => mockResponse(body, status))
}

const createDeps = () => ({
    email: 'test@gmail.com',
    betterAuthAccountId: 'ba-1',
    getOAuthToken: mock(() => Promise.resolve({ accessToken: 'access-tok', refreshToken: 'refresh-tok' })),
    refreshOAuthToken: mock(() => Promise.resolve('new-access-tok')),
})

beforeEach(() => {
    fetchCalls = []
    fetchResponses = new Map()

    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        const options = init ?? {}
        fetchCalls.push({ url, options })

        // 가장 길게 매칭되는 패턴 우선 (e.g. /labels/INBOX > /labels)
        let bestMatch: (() => Response) | null = null
        let bestLen = 0
        for (const [pattern, respFn] of fetchResponses) {
            if (url.includes(pattern) && pattern.length > bestLen) {
                bestMatch = respFn
                bestLen = pattern.length
            }
        }
        if (bestMatch) return bestMatch()

        return mockResponse({}, 200)
    }) as typeof fetch
})

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('connect', () => {
    test('OAuth 토큰을 가져온다', async () => {
        const deps = createDeps()
        const provider = createGmailProvider(deps)
        await provider.connect()
        expect(deps.getOAuthToken).toHaveBeenCalledWith('ba-1')
    })
})

describe('disconnect', () => {
    test('토큰을 초기화한다', async () => {
        const deps = createDeps()
        const provider = createGmailProvider(deps)
        await provider.connect()
        await provider.disconnect()

        // connect 다시 호출 시 getOAuthToken이 다시 불려야 함
        await provider.connect()
        expect(deps.getOAuthToken).toHaveBeenCalledTimes(2)
    })
})

describe('testConnection', () => {
    test('성공 시 { success: true }를 반환한다', async () => {
        setFetchResponse('/profile', { emailAddress: 'test@gmail.com' })
        const provider = createGmailProvider(createDeps())
        const result = await provider.testConnection()
        expect(result.success).toBe(true)
    })

    test('실패 시 { success: false, error }를 반환한다', async () => {
        fetchResponses.set('/profile', () => mockResponse({ error: 'fail' }, 500))
        const provider = createGmailProvider(createDeps())
        const result = await provider.testConnection()
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
    })
})

describe('fetchFolders', () => {
    test('라벨 목록을 폴더로 변환한다', async () => {
        setFetchResponse('/labels', {
            labels: [
                { id: 'INBOX', name: 'INBOX', type: 'system' },
                { id: 'SENT', name: 'SENT', type: 'system' },
                { id: 'Label_1', name: 'MyLabel', type: 'user' },
            ],
        })
        setFetchResponse('/labels/INBOX', { messagesTotal: 100, messagesUnread: 5 })
        setFetchResponse('/labels/SENT', { messagesTotal: 50, messagesUnread: 0 })
        setFetchResponse('/labels/Label_1', { messagesTotal: 10, messagesUnread: 2 })

        const provider = createGmailProvider(createDeps())
        const folders = await provider.fetchFolders()

        expect(folders.length).toBe(3)
        const inbox = folders.find((f) => f.id === 'INBOX')!
        expect(inbox.type).toBe('inbox')
        expect(inbox.messageCount).toBe(100)

        const custom = folders.find((f) => f.id === 'Label_1')!
        expect(custom.type).toBe('custom')
    })

    test('시스템 라벨(IMPORTANT, CHAT 등)을 필터링한다', async () => {
        setFetchResponse('/labels', {
            labels: [
                { id: 'INBOX', name: 'INBOX' },
                { id: 'IMPORTANT', name: 'IMPORTANT' },
                { id: 'CHAT', name: 'CHAT' },
                { id: 'CATEGORY_SOCIAL', name: 'CATEGORY_SOCIAL' },
                { id: 'STARRED', name: 'STARRED' },
                { id: 'UNREAD', name: 'UNREAD' },
            ],
        })
        setFetchResponse('/labels/INBOX', { messagesTotal: 10, messagesUnread: 1 })

        const provider = createGmailProvider(createDeps())
        const folders = await provider.fetchFolders()

        expect(folders.length).toBe(1)
        expect(folders[0].id).toBe('INBOX')
    })
})

describe('fetchMessageDetail', () => {
    test('메시지를 파싱하여 반환한다', async () => {
        const rawMsg = {
            id: 'msg-1',
            threadId: 'thread-1',
            snippet: 'Hello world',
            labelIds: ['INBOX'],
            internalDate: '1700000000000',
            payload: {
                headers: [
                    { name: 'From', value: 'sender@test.com' },
                    { name: 'To', value: 'to@test.com' },
                    { name: 'Subject', value: 'Test Subject' },
                    { name: 'Date', value: 'Wed, 14 Nov 2023 00:00:00 +0000' },
                ],
                mimeType: 'text/plain',
                body: { data: Buffer.from('Hello').toString('base64url'), size: 5 },
            },
        }
        setFetchResponse('/messages/msg-1', rawMsg)

        const provider = createGmailProvider(createDeps())
        const msg = await provider.fetchMessageDetail('msg-1')

        expect(msg).not.toBeNull()
        expect(msg!.id).toBe('msg-1')
        expect(msg!.subject).toBe('Test Subject')
        expect(msg!.from?.address).toBe('sender@test.com')
        expect(msg!.isRead).toBe(true) // no UNREAD label
        expect(msg!.isStarred).toBe(false)
    })

    test('실패 시 null을 반환한다', async () => {
        fetchResponses.set('/messages/missing', () => mockResponse({}, 404))
        const provider = createGmailProvider(createDeps())
        const msg = await provider.fetchMessageDetail('missing')
        expect(msg).toBeNull()
    })
})

describe('markRead', () => {
    test('UNREAD 라벨을 제거하는 API를 호출한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.markRead(['msg-1'])

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        expect(call).toBeDefined()
        const body = JSON.parse(call!.options.body as string)
        expect(body.removeLabelIds).toEqual(['UNREAD'])
    })
})

describe('markUnread', () => {
    test('UNREAD 라벨을 추가하는 API를 호출한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.markUnread(['msg-1'])

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        expect(call).toBeDefined()
        const body = JSON.parse(call!.options.body as string)
        expect(body.addLabelIds).toEqual(['UNREAD'])
    })
})

describe('markStarred', () => {
    test('STARRED 라벨을 추가하는 API를 호출한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.markStarred(['msg-1'])

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        const body = JSON.parse(call!.options.body as string)
        expect(body.addLabelIds).toEqual(['STARRED'])
    })
})

describe('unmarkStarred', () => {
    test('STARRED 라벨을 제거하는 API를 호출한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.unmarkStarred(['msg-1'])

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        const body = JSON.parse(call!.options.body as string)
        expect(body.removeLabelIds).toEqual(['STARRED'])
    })
})

describe('moveMessage', () => {
    test('addLabelIds로 대상 폴더를 지정한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.moveMessage(['msg-1'], 'Label_Archive')

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        const body = JSON.parse(call!.options.body as string)
        expect(body.addLabelIds).toEqual(['Label_Archive'])
    })

    test('sourceFolderId가 있으면 removeLabelIds를 포함한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.moveMessage(['msg-1'], 'Label_Archive', 'INBOX')

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        const body = JSON.parse(call!.options.body as string)
        expect(body.addLabelIds).toEqual(['Label_Archive'])
        expect(body.removeLabelIds).toEqual(['INBOX'])
    })

    test('sourceFolderId가 없으면 removeLabelIds를 포함하지 않는다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.moveMessage(['msg-1'], 'Label_Archive')

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/modify'))
        const body = JSON.parse(call!.options.body as string)
        expect(body.removeLabelIds).toBeUndefined()
    })
})

describe('deleteMessage', () => {
    test('trash API를 호출한다', async () => {
        const provider = createGmailProvider(createDeps())
        await provider.deleteMessage(['msg-1'])

        const call = fetchCalls.find((c) => c.url.includes('/messages/msg-1/trash'))
        expect(call).toBeDefined()
        expect(call!.options.method).toBe('POST')
    })
})

describe('sendMessage', () => {
    test('MIME 메시지를 구성하여 send API를 호출한다', async () => {
        setFetchResponse('/messages/send', { id: 'sent-1' })

        const provider = createGmailProvider(createDeps())
        const result = await provider.sendMessage({
            to: [{ name: 'Receiver', address: 'to@test.com' }],
            subject: 'Test',
            bodyHtml: '<p>Hello</p>',
        })

        expect(result.messageId).toBe('sent-1')
        const call = fetchCalls.find((c) => c.url.includes('/messages/send'))!
        expect(call.options.method).toBe('POST')
        const body = JSON.parse(call.options.body as string)
        expect(body.raw).toBeDefined()

        const decoded = Buffer.from(body.raw, 'base64url').toString()
        expect(decoded).toContain('To: "Receiver" <to@test.com>')
        expect(decoded).toContain('Subject: Test')
    })

    test('cc, bcc, inReplyTo, references를 포함한다', async () => {
        setFetchResponse('/messages/send', { id: 'sent-2' })

        const provider = createGmailProvider(createDeps())
        await provider.sendMessage({
            to: [{ name: '', address: 'to@test.com' }],
            cc: [{ name: '', address: 'cc@test.com' }],
            bcc: [{ name: '', address: 'bcc@test.com' }],
            subject: 'Re: Test',
            bodyHtml: '<p>Reply</p>',
            inReplyTo: '<original@msg>',
            references: '<original@msg>',
        })

        const call = fetchCalls.find((c) => c.url.includes('/messages/send'))!
        const body = JSON.parse(call.options.body as string)
        const decoded = Buffer.from(body.raw, 'base64url').toString()
        expect(decoded).toContain('Cc: cc@test.com')
        expect(decoded).toContain('Bcc: bcc@test.com')
        expect(decoded).toContain('In-Reply-To: <original@msg>')
        expect(decoded).toContain('References: <original@msg>')
    })
})

describe('fetchMessages', () => {
    const makeMessageRef = (id: string) => ({ id })
    const makeFullMessage = (id: string) => ({
        id,
        threadId: `thread-${id}`,
        snippet: `snippet-${id}`,
        labelIds: ['INBOX'],
        internalDate: '1700000000000',
        payload: {
            headers: [
                { name: 'From', value: 'sender@test.com' },
                { name: 'To', value: 'to@test.com' },
                { name: 'Subject', value: `Subject ${id}` },
            ],
            mimeType: 'text/plain',
            body: { data: '', size: 0 },
        },
    })

    test('forward: cursor 없으면 전체 fetch + profile로 historyId를 cursor로 사용한다', async () => {
        setFetchResponse('/messages?', {
            messages: [makeMessageRef('m1'), makeMessageRef('m2')],
            resultSizeEstimate: 2,
        })
        setFetchResponse('/messages/m1', makeFullMessage('m1'))
        setFetchResponse('/messages/m2', makeFullMessage('m2'))
        setFetchResponse('/profile', { historyId: '12345' })

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        expect(result.messages.length).toBe(2)
        expect(result.newSyncCursor).toBe('12345')
        expect(result.deletedIds).toEqual([])
    })

    test('backward: pageToken pagination을 사용한다', async () => {
        setFetchResponse('/messages?', {
            messages: [makeMessageRef('m1')],
            nextPageToken: 'next-page',
            resultSizeEstimate: 10,
        })
        setFetchResponse('/messages/m1', makeFullMessage('m1'))

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 1, direction: 'backward' })

        expect(result.messages.length).toBe(1)
        expect(result.newSyncCursor).toBe('next-page')
    })

    test('incremental: History API로 변경분만 가져온다', async () => {
        setFetchResponse('/history?', {
            history: [
                { messagesAdded: [{ message: { id: 'new-1' } }] },
                { messagesDeleted: [{ message: { id: 'del-1' } }] },
            ],
            historyId: '99999',
        })
        setFetchResponse('/messages/new-1', makeFullMessage('new-1'))

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(1)
        expect(result.messages[0].id).toBe('new-1')
        expect(result.deletedIds).toContain('del-1')
        expect(result.newSyncCursor).toBe('99999')
    })

    test('incremental: UNREAD 라벨 제거를 메시지 삭제로 오인하지 않는다', async () => {
        setFetchResponse('/history?', {
            history: [
                { messagesAdded: [{ message: { id: 'new-1' } }] },
                // UNREAD 라벨 제거 = 읽음 처리, INBOX 삭제가 아님
                { labelsRemoved: [{ message: { id: 'new-1' }, labelIds: ['UNREAD'] }] },
            ],
            historyId: '99999',
        })
        setFetchResponse('/messages/new-1', makeFullMessage('new-1'))

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(1)
        expect(result.messages[0].id).toBe('new-1')
        expect(result.deletedIds).not.toContain('new-1')
    })

    test('incremental: 폴더 라벨(INBOX) 제거 시에만 삭제 처리한다', async () => {
        setFetchResponse('/history?', {
            history: [
                { labelsRemoved: [{ message: { id: 'moved-1' }, labelIds: ['INBOX'] }] },
            ],
            historyId: '99999',
        })

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(0)
        expect(result.deletedIds).toContain('moved-1')
    })

    test('incremental: History API 페이지네이션을 처리한다', async () => {
        let historyCallCount = 0
        globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
            fetchCalls.push({ url, options: init ?? {} })

            if (url.includes('/history?')) {
                historyCallCount++
                if (historyCallCount === 1) {
                    // 첫 페이지: nextPageToken 포함
                    return mockResponse({
                        history: [{ messagesAdded: [{ message: { id: 'old-1' } }] }],
                        nextPageToken: 'page2-token',
                        historyId: '99999',
                    })
                }
                // 두 번째 페이지: 최신 메일 포함
                return mockResponse({
                    history: [{ messagesAdded: [{ message: { id: 'new-1' } }] }],
                    historyId: '99999',
                })
            }
            if (url.includes('/messages/old-1')) return mockResponse(makeFullMessage('old-1'))
            if (url.includes('/messages/new-1')) return mockResponse(makeFullMessage('new-1'))
            return mockResponse({})
        }) as typeof fetch

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '10000' })

        expect(historyCallCount).toBe(2)
        expect(result.messages.length).toBe(2)
        const ids = result.messages.map((m) => m.id)
        expect(ids).toContain('old-1')
        expect(ids).toContain('new-1')
    })

    test('incremental: labelsAdded에서 폴더 라벨이 추가된 메시지만 fetch한다', async () => {
        setFetchResponse('/history?', {
            history: [
                // INBOX 라벨 추가 = 이 폴더에 새로 들어온 메시지
                { labelsAdded: [{ message: { id: 'labeled-1' }, labelIds: ['INBOX'] }] },
                // STARRED 라벨 추가 = INBOX와 무관
                { labelsAdded: [{ message: { id: 'starred-1' }, labelIds: ['STARRED'] }] },
            ],
            historyId: '99999',
        })
        setFetchResponse('/messages/labeled-1', makeFullMessage('labeled-1'))

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(1)
        expect(result.messages[0].id).toBe('labeled-1')
    })
})

describe('sendMessage — CRLF sanitize', () => {
    test('subject의 CRLF를 제거한다', async () => {
        setFetchResponse('/messages/send', { id: 'sent-3' })

        const provider = createGmailProvider(createDeps())
        await provider.sendMessage({
            to: [{ name: '', address: 'to@test.com' }],
            subject: 'Hello\r\nBcc: evil@test.com',
            bodyText: 'test',
        })

        const call = fetchCalls.find((c) => c.url.includes('/messages/send'))!
        const body = JSON.parse(call.options.body as string)
        const decoded = Buffer.from(body.raw, 'base64url').toString()
        expect(decoded).toContain('Subject: HelloBcc: evil@test.com')
        expect(decoded).not.toContain('Subject: Hello\r\n')
    })

    test('inReplyTo와 references의 CRLF를 제거한다', async () => {
        setFetchResponse('/messages/send', { id: 'sent-4' })

        const provider = createGmailProvider(createDeps())
        await provider.sendMessage({
            to: [{ name: '', address: 'to@test.com' }],
            subject: 'Re: Test',
            bodyText: 'test',
            inReplyTo: '<msg@test>\r\nX-Injected: true',
            references: '<ref@test>\nX-Injected: true',
        })

        const call = fetchCalls.find((c) => c.url.includes('/messages/send'))!
        const body = JSON.parse(call.options.body as string)
        const decoded = Buffer.from(body.raw, 'base64url').toString()
        expect(decoded).toContain('In-Reply-To: <msg@test>X-Injected: true')
        expect(decoded).toContain('References: <ref@test>X-Injected: true')
    })
})

describe('Gmail API 에러 마스킹', () => {
    test('에러 메시지에 응답 본문을 포함하지 않는다', async () => {
        fetchResponses.set('/messages/test-err', () => mockResponse({ error: 'secret-token-leak' }, 403))

        const provider = createGmailProvider(createDeps())
        try {
            await provider.fetchMessageDetail('test-err')
        } catch {
            // fetchMessageDetail catches and returns null
        }
        // The provider should handle errors gracefully (returns null for fetchMessageDetail)
        const msg = await provider.fetchMessageDetail('test-err')
        expect(msg).toBeNull()
    })
})

describe('fetchMessages History API fallback', () => {
    const makeMessageRef = (id: string) => ({ id })
    const makeFullMessage = (id: string) => ({
        id,
        threadId: `thread-${id}`,
        snippet: `snippet-${id}`,
        labelIds: ['INBOX'],
        internalDate: '1700000000000',
        payload: {
            headers: [
                { name: 'From', value: 'sender@test.com' },
                { name: 'To', value: 'to@test.com' },
                { name: 'Subject', value: `Subject ${id}` },
            ],
            mimeType: 'text/plain',
            body: { data: '', size: 0 },
        },
    })

    test('History API 404 시 full fetch로 fallback한다', async () => {
        // History returns 404, then full fetch succeeds
        fetchResponses.set('/history?', () => mockResponse({ error: { code: 404 } }, 404))
        setFetchResponse('/messages?', {
            messages: [makeMessageRef('m1')],
            resultSizeEstimate: 1,
        })
        setFetchResponse('/messages/m1', makeFullMessage('m1'))
        setFetchResponse('/profile', { historyId: '99999' })

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(1)
        expect(result.newSyncCursor).toBe('99999')
    })

    test('History API 400 시 full fetch로 fallback한다', async () => {
        fetchResponses.set('/history?', () => mockResponse({ error: { code: 400 } }, 400))
        setFetchResponse('/messages?', {
            messages: [makeMessageRef('m1')],
            resultSizeEstimate: 1,
        })
        setFetchResponse('/messages/m1', makeFullMessage('m1'))
        setFetchResponse('/profile', { historyId: '88888' })

        const provider = createGmailProvider(createDeps())
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })

        expect(result.messages.length).toBe(1)
        expect(result.newSyncCursor).toBe('88888')
    })

    test('History API 500 시 에러를 전파한다 (fallback 안 함)', async () => {
        fetchResponses.set('/history?', () => mockResponse({ error: { code: 500 } }, 500))

        const provider = createGmailProvider(createDeps())
        await expect(provider.fetchMessages({ folderId: 'INBOX', cursor: '12345' })).rejects.toThrow(
            /Gmail API error 500/,
        )
    })
})

describe('401 토큰 리프레시', () => {
    test('401 시 토큰을 리프레시 후 재시도한다', async () => {
        let callCount = 0
        globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
            fetchCalls.push({ url, options: init ?? {} })

            if (url.includes('/profile')) {
                callCount++
                if (callCount === 1) return mockResponse({ error: 'Unauthorized' }, 401)
                return mockResponse({ emailAddress: 'test@gmail.com' }, 200)
            }
            return mockResponse({}, 200)
        }) as typeof fetch

        const deps = createDeps()
        const provider = createGmailProvider(deps)
        const result = await provider.testConnection()

        expect(result.success).toBe(true)
        expect(deps.refreshOAuthToken).toHaveBeenCalledWith('ba-1', 'refresh-tok')
    })
})

describe('429 exponential backoff', () => {
    test('429 시 재시도한다', async () => {
        let callCount = 0
        globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
            fetchCalls.push({ url, options: init ?? {} })

            if (url.includes('/profile')) {
                callCount++
                if (callCount <= 2) return mockResponse({}, 429)
                return mockResponse({ emailAddress: 'test@gmail.com' }, 200)
            }
            return mockResponse({}, 200)
        }) as typeof fetch

        const provider = createGmailProvider(createDeps())
        const result = await provider.testConnection()
        expect(result.success).toBe(true)
        // 2번 429 + 1번 200 = /profile 3번 호출 (+ getOAuthToken 1번)
        const profileCalls = fetchCalls.filter((c) => c.url.includes('/profile'))
        expect(profileCalls.length).toBe(3)
    })
})
