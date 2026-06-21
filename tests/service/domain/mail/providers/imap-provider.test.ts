import { describe, expect, test, mock, beforeEach } from 'bun:test'

let capturedImapConfig: Record<string, unknown> | null = null
let capturedSmtpConfig: Record<string, unknown> | null = null
let capturedFetchQueries: unknown[] = []

const mockImapConnect = mock(() => Promise.resolve())
const mockImapLogout = mock(() => Promise.resolve())

let mockUids: number[] = []
let capturedFetchFields: unknown[] = []
let mockEnvelopeByUid: Record<number, Record<string, unknown>> = {}
let mockReferencesByUid: Record<number, string> = {}

mock.module('imapflow', () => ({
    ImapFlow: class {
        constructor(config: Record<string, unknown>) {
            capturedImapConfig = config
        }
        connect = mockImapConnect
        logout = mockImapLogout
        getMailboxLock = mock(() => Promise.resolve({ release: () => {} }))
        status = mock(() => Promise.resolve({ messages: mockUids.length }))
        fetch(range: unknown, fields: unknown, _options?: unknown) {
            capturedFetchQueries.push(range)
            capturedFetchFields.push(fields)
            let uids = mockUids
            if (typeof range === 'string' && range.includes(',')) {
                const allowed = new Set(range.split(',').map(Number))
                uids = mockUids.filter((u) => allowed.has(u))
            }
            let index = 0
            return {
                [Symbol.asyncIterator]() {
                    return {
                        next() {
                            if (index < uids.length) {
                                const uid = uids[index++]
                                const references = mockReferencesByUid[uid]
                                return Promise.resolve({
                                    done: false,
                                    value: {
                                        uid,
                                        flags: new Set(),
                                        envelope: mockEnvelopeByUid[uid] ?? {
                                            from: [{ name: 'Test', address: 'test@test.com' }],
                                            to: [{ name: 'To', address: 'to@test.com' }],
                                            cc: [],
                                            bcc: [],
                                            subject: `Mail ${uid}`,
                                            date: new Date().toISOString(),
                                        },
                                        bodyStructure: {},
                                        source: Buffer.from(''),
                                        internalDate: new Date().toISOString(),
                                        headers: references ? Buffer.from(`References: ${references}\r\n`) : undefined,
                                    },
                                })
                            }
                            return Promise.resolve({ done: true, value: undefined })
                        },
                    }
                },
            }
        }
    },
}))

mock.module('nodemailer', () => ({
    default: {
        createTransport: (config: Record<string, unknown>) => {
            capturedSmtpConfig = config
            return {
                sendMail: mock(() => Promise.resolve({ messageId: '<test@msg>' })),
            }
        },
    },
}))

const { createImapProvider } = await import('../../../../../service/domain/mail/providers/imap-provider')

const baseDeps = {
    email: 'bbb301@naver.com',
    password: 'app-password',
    imapHost: 'imap.naver.com',
    imapPort: 993,
    imapTls: true,
    smtpHost: 'smtp.naver.com',
    smtpPort: 587,
    smtpTls: true,
}

beforeEach(() => {
    capturedImapConfig = null
    capturedSmtpConfig = null
    capturedFetchQueries = []
    capturedFetchFields = []
    mockUids = []
    mockEnvelopeByUid = {}
    mockReferencesByUid = {}
})

describe('createImapProvider auth.user', () => {
    test('username이 있으면 IMAP auth.user로 사용한다', async () => {
        const provider = createImapProvider({ ...baseDeps, username: 'bbb301' })
        await provider.connect()

        expect(capturedImapConfig).not.toBeNull()
        const auth = capturedImapConfig!.auth as { user: string; pass: string }
        expect(auth.user).toBe('bbb301')
        expect(auth.pass).toBe('app-password')
    })

    test('username이 없으면 email을 IMAP auth.user로 사용한다', async () => {
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()

        const auth = capturedImapConfig!.auth as { user: string; pass: string }
        expect(auth.user).toBe('bbb301@naver.com')
    })

    test('username이 있으면 SMTP auth.user로 사용한다', async () => {
        const provider = createImapProvider({ ...baseDeps, username: 'bbb301' })
        await provider.sendMessage({
            to: [{ name: '', address: 'to@test.com' }],
            subject: 'test',
            bodyHtml: '<p>hi</p>',
        })

        expect(capturedSmtpConfig).not.toBeNull()
        const auth = capturedSmtpConfig!.auth as { user: string; pass: string }
        expect(auth.user).toBe('bbb301')
    })

    test('username이 없으면 email을 SMTP auth.user로 사용한다', async () => {
        const provider = createImapProvider({ ...baseDeps })
        await provider.sendMessage({
            to: [{ name: '', address: 'to@test.com' }],
            subject: 'test',
            bodyHtml: '<p>hi</p>',
        })

        const auth = capturedSmtpConfig!.auth as { user: string; pass: string }
        expect(auth.user).toBe('bbb301@naver.com')
    })

    test('testConnection에서도 username을 사용한다', async () => {
        const provider = createImapProvider({ ...baseDeps, username: 'bbb301' })
        await provider.testConnection()

        const auth = capturedImapConfig!.auth as { user: string; pass: string }
        expect(auth.user).toBe('bbb301')
    })
})

describe('fetchMessages direction', () => {
    test('forward: cursor 없으면 시퀀스 "1:*"로 전체 조회한다', async () => {
        mockUids = [10, 20, 30]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        expect(capturedFetchQueries[0]).toBe('1:*')
        expect(result.messages.length).toBe(3)
        expect(result.newSyncCursor).toBe('30')
    })

    test('forward: cursor 있으면 UID range "cursor+1:*"로 조회한다', async () => {
        mockUids = [31, 32]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '30', batchSize: 100 })

        expect(capturedFetchQueries[0]).toBe('31:*')
        expect(result.newSyncCursor).toBe('32')
    })

    test('backward: cursor 없으면 시퀀스 "1:*"로 전체 조회, cursor = min UID', async () => {
        mockUids = [10, 20, 30]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 2, direction: 'backward' })

        expect(capturedFetchQueries[0]).toBe('1:*')
        expect(result.messages.length).toBe(2)
        expect(result.newSyncCursor).toBe('20')
    })

    test('backward: cursor 있으면 UID range "1:cursor-1"로 조회한다', async () => {
        mockUids = [5, 10, 15]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '20', batchSize: 2, direction: 'backward' })

        expect(capturedFetchQueries[0]).toBe('1:19')
        expect(result.newSyncCursor).toBe('10')
    })

    test('backward: 마지막 배치면 cursor null 반환 (hasMore=false)', async () => {
        mockUids = [1, 2]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '10', batchSize: 100, direction: 'backward' })

        expect(result.messages.length).toBe(2)
        expect(result.newSyncCursor).toBeNull()
    })

    test('forward: 마지막 배치여도 cursor를 유지한다 (incremental용)', async () => {
        mockUids = [31, 32]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '30', batchSize: 100, direction: 'forward' })

        expect(result.newSyncCursor).toBe('32')
    })

    test('빈 메일함이면 fetch 없이 빈 결과 반환', async () => {
        mockUids = []
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100, direction: 'backward' })

        expect(result.messages.length).toBe(0)
        expect(result.newSyncCursor).toBeNull()
        expect(capturedFetchQueries.length).toBe(0)
    })
})

describe('threadId derive', () => {
    test('References 헤더의 첫 토큰을 threadId로 매핑한다', async () => {
        mockUids = [100]
        mockReferencesByUid = { 100: '<root@a.com> <reply1@b.com>' }
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        expect(result.messages[0].references).toBe('<root@a.com> <reply1@b.com>')
        expect(result.messages[0].threadId).toBe('<root@a.com>')
    })

    test('References가 없고 inReplyTo가 있으면 inReplyTo를 threadId로 매핑한다', async () => {
        mockUids = [101]
        mockEnvelopeByUid = {
            101: {
                from: [{ name: 'Test', address: 'test@test.com' }],
                to: [],
                cc: [],
                bcc: [],
                subject: 'Re: hi',
                messageId: '<self@d.com>',
                inReplyTo: '<parent@b.com>',
                date: new Date().toISOString(),
            },
        }
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        expect(result.messages[0].threadId).toBe('<parent@b.com>')
    })

    test('References와 inReplyTo가 없으면 messageId를 threadId로 매핑한다 (대화 root)', async () => {
        mockUids = [102]
        mockEnvelopeByUid = {
            102: {
                from: [{ name: 'Test', address: 'test@test.com' }],
                to: [],
                cc: [],
                bcc: [],
                subject: 'hi',
                messageId: '<self@d.com>',
                date: new Date().toISOString(),
            },
        }
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        expect(result.messages[0].threadId).toBe('<self@d.com>')
    })

    test('fetch 쿼리에 references 헤더 요청을 포함한다', async () => {
        mockUids = [103]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100 })

        const detailFetch = capturedFetchFields.find((f) => f && typeof f === 'object' && 'headers' in (f as object)) as
            | { headers?: unknown }
            | undefined
        expect(detailFetch?.headers).toEqual(['references'])
    })

    test('fetchMessageDetail도 References 첫 토큰을 threadId로 매핑한다', async () => {
        mockUids = [104]
        mockReferencesByUid = { 104: '<root@a.com> <reply1@b.com> <reply2@c.com>' }
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const msg = await provider.fetchMessageDetail('104')

        expect(msg?.threadId).toBe('<root@a.com>')
        expect(msg?.references).toBe('<root@a.com> <reply1@b.com> <reply2@c.com>')
    })
})
