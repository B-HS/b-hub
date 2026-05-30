import { describe, expect, test, mock } from 'bun:test'
import { createMailMessageService } from '../../../../service/domain/mail/mail-message'

const mockMessage = (overrides = {}) => ({
    id: 1,
    accountId: 1,
    folderId: 1,
    remoteMessageId: 'remote-1',
    messageIdHeader: '<msg-1@example.com>',
    threadId: 'thread-1',
    inReplyTo: null,
    referencesHeader: null,
    fromAddress: { name: 'Sender', address: 'sender@test.com' },
    toAddresses: [{ name: 'Receiver', address: 'receiver@test.com' }],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    snippet: 'Hello',
    isRead: false,
    isStarred: false,
    isDraft: false,
    hasAttachments: false,
    sentAt: new Date(),
    receivedAt: new Date(),
    uid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
    ...overrides,
})

const mockAttachment = (overrides = {}) => ({
    id: 10,
    messageId: 1,
    remoteAttachmentId: 'att-remote-1',
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    contentId: null,
    isInline: false,
    r2Key: null,
    createdAt: new Date(),
    ...overrides,
})

const createMockDb = () => ({
    list: mock(() => Promise.resolve({ data: [mockMessage()], total: 1 })),
    getById: mock((id: number) => Promise.resolve(id === 1 ? mockMessage() : null)),
    getThread: mock(() => Promise.resolve([mockMessage()])),
    search: mock(() => Promise.resolve({ data: [mockMessage()], total: 1 })),
    updateFlags: mock(() => Promise.resolve()),
    moveToFolder: mock(() => Promise.resolve()),
    deleteMessages: mock(() => Promise.resolve()),
    getByIds: mock(() => Promise.resolve([mockMessage()])),
    getAttachment: mock((id: number) => Promise.resolve(id === 10 ? mockAttachment() : null)),
    updateAttachmentR2Key: mock(() => Promise.resolve()),
    getAccountIdsByMessageIds: mock(() => Promise.resolve([{ messageId: 1, accountId: 1, remoteMessageId: 'remote-1', folderId: 1 }])),
    getSenderList: mock(() =>
        Promise.resolve([
            { address: 'alice@test.com', name: 'Alice' },
            { address: 'bob@test.com', name: '' },
        ]),
    ),
    countMessagesByFolder: mock(() => Promise.resolve(10)),
    countUnreadByFolder: mock(() => Promise.resolve(3)),
    updateFolderCounts: mock(() => Promise.resolve()),
    getFolderById: mock((id: number) => Promise.resolve({ id, accountId: 1, remoteFolderId: 'INBOX' })),
})

const mockProvider = () => ({
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    testConnection: mock(() => Promise.resolve({ success: true })),
    fetchFolders: mock(() => Promise.resolve([])),
    fetchMessages: mock(() => Promise.resolve({ messages: [], deletedIds: [], newSyncCursor: null })),
    fetchMessageDetail: mock(() => Promise.resolve(null)),
    markRead: mock(() => Promise.resolve()),
    markUnread: mock(() => Promise.resolve()),
    markStarred: mock(() => Promise.resolve()),
    unmarkStarred: mock(() => Promise.resolve()),
    moveMessage: mock(() => Promise.resolve()),
    deleteMessage: mock(() => Promise.resolve()),
    downloadAttachment: mock(() => Promise.resolve({ content: Buffer.from('file-data'), filename: 'file.pdf', mimeType: 'application/pdf' })),
    sendMessage: mock(() => Promise.resolve({ messageId: 'sent-1' })),
})

const createMockAccountService = () => {
    const provider = mockProvider()
    return {
        list: mock(() => Promise.resolve([{ id: 1, userId: 'user-1', provider: 'gmail', email: 'test@gmail.com' }])),
        getById: mock(() => Promise.resolve({ id: 1, userId: 'user-1' })),
        create: mock(() => Promise.resolve({ id: 1 })),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        testConnection: mock(() => Promise.resolve({ success: true })),
        getProvider: mock(() => Promise.resolve({ provider, account: { id: 1, userId: 'user-1' } })),
        updateSyncStatus: mock(() => Promise.resolve()),
        _provider: provider,
    }
}

const createDeps = (
    overrides: {
        db?: Partial<ReturnType<typeof createMockDb>>
        accountService?: Partial<ReturnType<typeof createMockAccountService>>
        storageService?: unknown
    } = {},
) => {
    const accountService = { ...createMockAccountService(), ...overrides.accountService }
    return {
        db: { ...createMockDb(), ...overrides.db } as ReturnType<typeof createMockDb>,
        accountService: accountService as unknown as ReturnType<typeof createMockAccountService>,
        ...(overrides.storageService !== undefined ? { storageService: overrides.storageService as never } : {}),
    }
}

describe('createMailMessageService', () => {
    describe('list', () => {
        test('메시지 목록을 반환한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            const result = await service.list('user-1', {})
            expect(result.data).toHaveLength(1)
            expect(result.total).toBe(1)
        })

        test('기본 페이지네이션을 적용한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.list('user-1', {})
            expect(deps.db.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }))
        })

        test('필터를 전달한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.list('user-1', { accountId: 1, isRead: true, page: 2, limit: 10 })
            expect(deps.db.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountId: 1,
                    isRead: true,
                    page: 2,
                    limit: 10,
                }),
            )
        })
    })

    describe('getById', () => {
        test('소유한 메시지를 반환한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            const result = await service.getById('user-1', 1)
            expect(result.id).toBe(1)
        })

        test('없는 메시지는 에러를 발생시킨다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await expect(service.getById('user-1', 999)).rejects.toMatchObject({
                code: 'MAIL_MESSAGE_NOT_FOUND',
            })
        })

        test('다른 사용자의 메시지는 에러를 발생시킨다', async () => {
            const deps = createDeps({
                accountService: {
                    list: mock(() => Promise.resolve([{ id: 2, userId: 'user-2' }])),
                } as never,
            })
            const service = createMailMessageService(deps)
            await expect(service.getById('user-2', 1)).rejects.toMatchObject({
                code: 'MAIL_MESSAGE_NOT_FOUND',
            })
        })
    })

    describe('markRead', () => {
        test('DB와 프로바이더를 업데이트한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.markRead('user-1', [1])
            expect(deps.db.updateFlags).toHaveBeenCalledWith([1], { isRead: true })
        })

        test('프로바이더 실패 시에도 DB는 업데이트한다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.markRead = mock(() => Promise.reject(new Error('fail')))
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.markRead('user-1', [1])
            expect(deps.db.updateFlags).toHaveBeenCalledWith([1], { isRead: true })
        })

        test('markRead 후 폴더 unread 카운트가 감소한다', async () => {
            const deps = createDeps({
                db: {
                    countUnreadByFolder: mock(() => Promise.resolve(2)),
                    countMessagesByFolder: mock(() => Promise.resolve(10)),
                } as never,
            })
            const service = createMailMessageService(deps)
            await service.markRead('user-1', [1])
            expect(deps.db.updateFolderCounts).toHaveBeenCalledWith(1, 10, 2)
        })
    })

    describe('markUnread', () => {
        test('DB를 업데이트한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.markUnread('user-1', [1])
            expect(deps.db.updateFlags).toHaveBeenCalledWith([1], { isRead: false })
        })
    })

    describe('reply', () => {
        test('In-Reply-To와 References 헤더를 설정한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.reply('user-1', 1, { bodyHtml: '<p>Reply</p>' })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            expect(sendCall.inReplyTo).toBe('<msg-1@example.com>')
            expect(sendCall.references).toContain('<msg-1@example.com>')
        })

        test('Re: 접두사를 추가한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.reply('user-1', 1, { bodyText: 'Reply' })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            expect(sendCall.subject).toBe('Re: Test Subject')
        })

        test('to 미지정 시 원본 발신자를 사용한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.reply('user-1', 1, { bodyText: 'Reply' })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            const to = sendCall.to as Array<{ name: string; address: string }>
            expect(to[0].address).toBe('sender@test.com')
        })

        test('원본 메시지가 없으면 에러를 발생시킨다', async () => {
            const deps = createDeps({
                db: { getById: mock(() => Promise.resolve(null)) } as never,
            })
            const service = createMailMessageService(deps)
            await expect(service.reply('user-1', 999, { bodyText: 'Reply' })).rejects.toMatchObject({
                code: 'MAIL_MESSAGE_NOT_FOUND',
            })
        })
    })

    describe('forward', () => {
        test('Fwd: 접두사를 추가한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.forward('user-1', 1, {
                to: [{ name: 'Third', address: 'third@test.com' }],
            })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            expect(sendCall.subject).toBe('Fwd: Test Subject')
        })

        test('원본 본문을 포함한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.forward('user-1', 1, {
                to: [{ name: 'Third', address: 'third@test.com' }],
            })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            expect(sendCall.bodyHtml as string).toContain('Forwarded message')
            expect(sendCall.bodyHtml as string).toContain('sender@test.com')
        })

        test('bodyHtml 우선순위', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.forward('user-1', 1, {
                to: [{ name: 'Third', address: 'third@test.com' }],
                bodyHtml: '<p>Custom forward body</p>',
            })

            const sendCall = accountService._provider.sendMessage.mock.calls[0][0] as Record<string, unknown>
            expect(sendCall.bodyHtml as string).toContain('Custom forward body')
        })
    })

    describe('downloadAttachment', () => {
        test('R2 캐시 히트 시 R2에서 반환한다', async () => {
            const storageService = {
                upload: mock(() => Promise.resolve()),
                getUrl: mock(() => 'https://r2.example.com/file'),
                download: mock(() => Promise.resolve(Buffer.from('cached'))),
            }
            const deps = createDeps({
                db: { getAttachment: mock(() => Promise.resolve(mockAttachment({ r2Key: 'mail/att/1' }))) } as never,
                storageService,
            })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.content.toString()).toBe('cached')
            expect(storageService.download).toHaveBeenCalledWith('mail/att/1')
        })

        test('R2 미스 시 프로바이더에서 가져와 R2에 저장한다', async () => {
            const storageService = {
                upload: mock(() => Promise.resolve()),
                getUrl: mock(() => 'https://r2.example.com/file'),
                download: mock(() => Promise.resolve(null)),
            }
            const accountService = createMockAccountService()
            const deps = createDeps({
                db: { getAttachment: mock(() => Promise.resolve(mockAttachment({ r2Key: 'mail/att/1' }))) } as never,
                accountService: accountService as never,
                storageService,
            })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.filename).toBe('file.pdf')
            expect(storageService.upload).toHaveBeenCalledTimes(1)
        })

        test('storageService 없으면 프로바이더에서 직접 반환한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.filename).toBe('file.pdf')
        })

        test('프로바이더 다운로드 실패는 MAIL_ATTACHMENT_DOWNLOAD_FAILED로 변환된다 (INTERNAL_ERROR 아님)', async () => {
            const accountService = createMockAccountService()
            accountService._provider.downloadAttachment = mock(() => Promise.reject(new Error('Gmail API error 404'))) as never
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await expect(service.downloadAttachment('user-1', 1, 10)).rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_DOWNLOAD_FAILED' })
        })

        test('R2 캐시 저장이 실패해도 내려받은 콘텐츠를 반환한다', async () => {
            const storageService = {
                upload: mock(() => Promise.reject(new Error('R2 upload down'))),
                getUrl: mock(() => 'https://r2.example.com/file'),
                download: mock(() => Promise.resolve(null)),
            }
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never, storageService })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.content.toString()).toBe('file-data')
            expect(result.filename).toBe('file.pdf')
        })

        test('R2 캐시 읽기가 실패하면 프로바이더로 폴백한다', async () => {
            const storageService = {
                upload: mock(() => Promise.resolve()),
                getUrl: mock(() => 'https://r2.example.com/file'),
                download: mock(() => Promise.reject(new Error('R2 read down'))),
            }
            const accountService = createMockAccountService()
            const deps = createDeps({
                db: { getAttachment: mock(() => Promise.resolve(mockAttachment({ r2Key: 'mail/att/1' }))) } as never,
                accountService: accountService as never,
                storageService,
            })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.filename).toBe('file.pdf')
            expect(accountService._provider.downloadAttachment).toHaveBeenCalled()
        })

        test('메시지 폴더의 remoteFolderId를 provider.downloadAttachment에 전달한다 (IMAP UID 조회용)', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                db: { getFolderById: mock(() => Promise.resolve({ id: 7, accountId: 1, remoteFolderId: 'Archive' })) } as never,
                accountService: accountService as never,
            })
            const service = createMailMessageService(deps)
            await service.downloadAttachment('user-1', 1, 10)
            expect(accountService._provider.downloadAttachment).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Archive')
        })

        test('stale remote id면 메시지를 재조회해 fresh id로 재시도한다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.downloadAttachment = mock((_mid: string, aid: string) =>
                aid === 'att-remote-FRESH'
                    ? Promise.resolve({ content: Buffer.from('recovered'), filename: 'file.pdf', mimeType: 'application/pdf' })
                    : Promise.reject(new Error('Gmail API error 404')),
            ) as never
            accountService._provider.fetchMessageDetail = mock(() =>
                Promise.resolve({
                    attachments: [{ id: 'att-remote-FRESH', filename: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 1024, contentId: null, isInline: false }],
                }),
            ) as never
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            const result = await service.downloadAttachment('user-1', 1, 10)
            expect(result.content.toString()).toBe('recovered')
        })

        test('재조회로도 매칭 실패하면 원본 에러를 MAIL_ATTACHMENT_DOWNLOAD_FAILED로 던진다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.downloadAttachment = mock(() => Promise.reject(new Error('Gmail API error 404'))) as never
            accountService._provider.fetchMessageDetail = mock(() => Promise.resolve({ attachments: [] })) as never
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await expect(service.downloadAttachment('user-1', 1, 10)).rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_DOWNLOAD_FAILED' })
        })

        test('재조회 결과 id가 동일하면 재시도하지 않고 실패한다 (무한 루프 방지)', async () => {
            const accountService = createMockAccountService()
            const dl = mock(() => Promise.reject(new Error('Gmail API error 403')))
            accountService._provider.downloadAttachment = dl as never
            accountService._provider.fetchMessageDetail = mock(() =>
                Promise.resolve({
                    attachments: [{ id: 'att-remote-1', filename: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 1024, contentId: null, isInline: false }],
                }),
            ) as never
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await expect(service.downloadAttachment('user-1', 1, 10)).rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_DOWNLOAD_FAILED' })
            expect(dl).toHaveBeenCalledTimes(1)
        })
    })

    describe('moveToFolder', () => {
        test('프로바이더에 source folder remoteFolderId를 전달한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.moveToFolder('user-1', [1], 2)

            expect(accountService._provider.moveMessage).toHaveBeenCalled()
            expect(deps.db.moveToFolder).toHaveBeenCalledWith([1], 2)
        })

        test('프로바이더 실패 시에도 DB는 업데이트한다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.moveMessage = mock(() => Promise.reject(new Error('fail')))
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await service.moveToFolder('user-1', [1], 2)
            expect(deps.db.moveToFolder).toHaveBeenCalledWith([1], 2)
        })

        test('다른 계정의 targetFolderId로 이동 시 에러를 발생시킨다 (IDOR 방어)', async () => {
            const deps = createDeps({
                db: {
                    getFolderById: mock(() => Promise.resolve({ id: 99, accountId: 999, remoteFolderId: 'OTHER' })),
                } as never,
            })
            const service = createMailMessageService(deps)
            await expect(service.moveToFolder('user-1', [1], 99)).rejects.toMatchObject({
                code: 'MAIL_FOLDER_NOT_FOUND',
            })
        })

        test('같은 계정의 targetFolderId는 성공한다', async () => {
            const deps = createDeps({
                db: {
                    getFolderById: mock(() => Promise.resolve({ id: 2, accountId: 1, remoteFolderId: 'SENT' })),
                } as never,
            })
            const service = createMailMessageService(deps)
            await service.moveToFolder('user-1', [1], 2)
            expect(deps.db.moveToFolder).toHaveBeenCalledWith([1], 2)
        })

        test('moveToFolder에서 원본 폴더의 remoteFolderId를 조회한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService: accountService as never,
                db: {
                    getFolderById: mock((id: number) => {
                        if (id === 1) return Promise.resolve({ id: 1, accountId: 1, remoteFolderId: 'INBOX' })
                        if (id === 2) return Promise.resolve({ id: 2, accountId: 1, remoteFolderId: 'ARCHIVE' })
                        return Promise.resolve(null)
                    }),
                } as never,
            })
            const service = createMailMessageService(deps)
            await service.moveToFolder('user-1', [1], 2)

            expect(accountService._provider.moveMessage).toHaveBeenCalledWith(['remote-1'], 'ARCHIVE', 'INBOX')
        })
    })

    describe('getSenderList', () => {
        test('발신자 목록을 반환한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            const result = await service.getSenderList('user-1', {})
            expect(result).toHaveLength(2)
            expect(result[0].address).toBe('alice@test.com')
            expect(result[1].name).toBe('')
        })

        test('기본 limit 10000을 적용한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.getSenderList('user-1', {})
            expect(deps.db.getSenderList).toHaveBeenCalledWith({
                userId: 'user-1',
                accountId: undefined,
                limit: 10000,
            })
        })

        test('accountId와 limit를 전달한다', async () => {
            const deps = createDeps()
            const service = createMailMessageService(deps)
            await service.getSenderList('user-1', { accountId: 2, limit: 500 })
            expect(deps.db.getSenderList).toHaveBeenCalledWith({
                userId: 'user-1',
                accountId: 2,
                limit: 500,
            })
        })
    })

    describe('send', () => {
        test('메일을 발송한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            const result = await service.send('user-1', 1, {
                to: [{ name: 'To', address: 'to@test.com' }],
                subject: 'Hi',
                bodyText: 'Hello',
            })
            expect(result.messageId).toBe('sent-1')
        })

        test('실패 시 disconnect하고 에러를 발생시킨다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.sendMessage = mock(() => Promise.reject(new Error('SMTP error')))
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailMessageService(deps)
            await expect(
                service.send('user-1', 1, {
                    to: [{ name: 'To', address: 'to@test.com' }],
                    subject: 'Hi',
                    bodyText: 'Hello',
                }),
            ).rejects.toMatchObject({ code: 'MAIL_SEND_FAILED' })
            expect(accountService._provider.disconnect).toHaveBeenCalled()
        })
    })
})
