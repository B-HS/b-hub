import { describe, expect, test, mock, beforeEach } from 'bun:test'

let capturedImapConfig: Record<string, unknown> | null = null
let capturedSmtpConfig: Record<string, unknown> | null = null
let capturedFetchQueries: unknown[] = []

const mockImapConnect = mock(() => Promise.resolve())
const mockImapLogout = mock(() => Promise.resolve())

// UIDs returned by the mock IMAP fetch — configurable per test
let mockUids: number[] = []

mock.module('imapflow', () => ({
    ImapFlow: class {
        constructor(config: Record<string, unknown>) {
            capturedImapConfig = config
        }
        connect = mockImapConnect
        logout = mockImapLogout
        getMailboxLock = mock(() => Promise.resolve({ release: () => {} }))
        status = mock(() => Promise.resolve({ messages: mockUids.length }))
        fetch(range: unknown, _fields: unknown, _options?: unknown) {
            capturedFetchQueries.push(range)
            // If range is a comma-separated UID string like "30,20", filter to those UIDs
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
                                return Promise.resolve({
                                    done: false,
                                    value: {
                                        uid,
                                        flags: new Set(),
                                        envelope: {
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

// import after mocking
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
    mockUids = []
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
        expect(result.newSyncCursor).toBe('30') // max UID
    })

    test('forward: cursor 있으면 UID range "cursor+1:*"로 조회한다', async () => {
        mockUids = [31, 32]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '30', batchSize: 100 })

        expect(capturedFetchQueries[0]).toBe('31:*')
        expect(result.newSyncCursor).toBe('32') // max UID
    })

    test('backward: cursor 없으면 시퀀스 "1:*"로 전체 조회, cursor = min UID', async () => {
        mockUids = [10, 20, 30]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 2, direction: 'backward' })

        expect(capturedFetchQueries[0]).toBe('1:*')
        // batchSize=2, uids desc=[30,20,10], batch=[30,20], 3 > 2 → hasMore
        expect(result.messages.length).toBe(2)
        expect(result.newSyncCursor).toBe('20') // min of batch
    })

    test('backward: cursor 있으면 UID range "1:cursor-1"로 조회한다', async () => {
        mockUids = [5, 10, 15]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '20', batchSize: 2, direction: 'backward' })

        expect(capturedFetchQueries[0]).toBe('1:19')
        // uids desc=[15,10,5], batch=[15,10], 3 > 2 → hasMore
        expect(result.newSyncCursor).toBe('10') // min of batch
    })

    test('backward: 마지막 배치면 cursor null 반환 (hasMore=false)', async () => {
        mockUids = [1, 2]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '10', batchSize: 100, direction: 'backward' })

        // uids.length(2) <= batchSize(100) → 마지막 배치
        expect(result.messages.length).toBe(2)
        expect(result.newSyncCursor).toBeNull()
    })

    test('forward: 마지막 배치여도 cursor를 유지한다 (incremental용)', async () => {
        mockUids = [31, 32]
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', cursor: '30', batchSize: 100, direction: 'forward' })

        // uids.length(2) <= batchSize(100) but forward → cursor preserved
        expect(result.newSyncCursor).toBe('32')
    })

    test('빈 메일함이면 fetch 없이 빈 결과 반환', async () => {
        mockUids = []
        const provider = createImapProvider({ ...baseDeps })
        await provider.connect()
        const result = await provider.fetchMessages({ folderId: 'INBOX', batchSize: 100, direction: 'backward' })

        expect(result.messages.length).toBe(0)
        expect(result.newSyncCursor).toBeNull()
        // totalEstimate=0이면 fetch 자체를 하지 않음
        expect(capturedFetchQueries.length).toBe(0)
    })
})
