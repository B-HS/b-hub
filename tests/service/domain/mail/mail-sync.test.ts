import { describe, expect, test, mock } from 'bun:test'
import { createMailSyncService } from '../../../../service/domain/mail/mail-sync'

const mockFolder = (overrides = {}) => ({
    id: 1,
    accountId: 1,
    remoteFolderId: 'INBOX',
    name: 'Inbox',
    type: 'inbox',
    parentId: null,
    messageCount: 10,
    unreadCount: 2,
    uidValidity: null,
    syncCursor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const mockSyncLog = (overrides = {}) => ({
    id: 1,
    accountId: 1,
    syncType: 'incremental',
    status: 'running',
    folderId: null,
    messagesAdded: 0,
    messagesUpdated: 0,
    messagesDeleted: 0,
    durationMs: null,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
})

const mockSession = (overrides = {}) => ({
    id: 1,
    accountId: 1,
    folderId: 1,
    syncType: 'historical',
    status: 'running',
    totalEstimate: 100,
    syncedCount: 50,
    cursor: 'page-token',
    startedAt: new Date(),
    lastBatchAt: null,
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
})

const mockMessage = (id: string) => ({
    id,
    threadId: 'thread-1',
    from: { name: 'Sender', address: 'sender@test.com' },
    to: [{ name: 'To', address: 'to@test.com' }],
    cc: [],
    bcc: [],
    subject: 'Test',
    bodyHtml: '<p>Test</p>',
    bodyText: 'Test',
    snippet: 'Test',
    isRead: false,
    isStarred: false,
    isDraft: false,
    sentAt: new Date(),
    receivedAt: new Date(),
    attachments: [],
})

const createMockDb = () => ({
    upsertFolder: mock(() => Promise.resolve(mockFolder())),
    getFoldersByAccount: mock(() => Promise.resolve([mockFolder()])),
    getFolderById: mock(() => Promise.resolve(mockFolder())),
    updateFolderCounts: mock(() => Promise.resolve()),
    updateFolderSyncCursor: mock(() => Promise.resolve()),
    upsertMessage: mock(() => Promise.resolve({ id: 1, isNew: true })),
    deleteMessagesByRemoteIds: mock(() => Promise.resolve()),
    upsertAttachment: mock(() => Promise.resolve({ id: 1 })),
    createSyncLog: mock(() => Promise.resolve(mockSyncLog())),
    updateSyncLog: mock(() => Promise.resolve()),
    getLatestSyncLog: mock(() => Promise.resolve(mockSyncLog({ status: 'success', completedAt: new Date() }))),
    getActiveSession: mock(() => Promise.resolve(null)),
    createSession: mock(() => Promise.resolve(mockSession())),
    updateSession: mock(() => Promise.resolve()),
    countMessagesByFolder: mock(() => Promise.resolve(10)),
    countUnreadByFolder: mock(() => Promise.resolve(2)),
})

const mockProvider = () => ({
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    testConnection: mock(() => Promise.resolve({ success: true })),
    fetchFolders: mock(() => Promise.resolve([{ id: 'INBOX', name: 'Inbox', type: 'inbox' as const, messageCount: 10, unreadCount: 2 }])),
    fetchMessages: mock(() =>
        Promise.resolve({
            messages: [mockMessage('msg-1'), mockMessage('msg-2')],
            deletedIds: [],
            newSyncCursor: 'new-cursor',
            totalEstimate: 50,
        }),
    ),
    fetchMessageDetail: mock(() => Promise.resolve(null)),
    markRead: mock(() => Promise.resolve()),
    markUnread: mock(() => Promise.resolve()),
    markStarred: mock(() => Promise.resolve()),
    unmarkStarred: mock(() => Promise.resolve()),
    moveMessage: mock(() => Promise.resolve()),
    deleteMessage: mock(() => Promise.resolve()),
    downloadAttachment: mock(() => Promise.resolve({ content: Buffer.from(''), filename: '', mimeType: '' })),
    sendMessage: mock(() => Promise.resolve({ messageId: 'msg-1' })),
})

const createMockAccountService = () => {
    const provider = mockProvider()
    return {
        list: mock(() => Promise.resolve([])),
        getById: mock(() =>
            Promise.resolve({
                id: 1,
                userId: 'user-1',
                lastSyncAt: null,
                lastSyncStatus: 'pending',
            }),
        ),
        create: mock(() => Promise.resolve({ id: 1 })),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        testConnection: mock(() => Promise.resolve({ success: true })),
        getProvider: mock(() =>
            Promise.resolve({
                provider,
                account: { id: 1, userId: 'user-1', syncCursor: null },
            }),
        ),
        updateSyncStatus: mock(() => Promise.resolve()),
        _provider: provider,
    }
}

const createDeps = (overrides: { db?: Partial<ReturnType<typeof createMockDb>>; accountService?: unknown } = {}) => ({
    db: { ...createMockDb(), ...overrides.db } as ReturnType<typeof createMockDb>,
    accountService: (overrides.accountService ?? createMockAccountService()) as unknown as ReturnType<typeof createMockAccountService>,
})

describe('createMailSyncService', () => {
    describe('syncAccount', () => {
        test('폴더 동기화, 메시지 upsert, 로그 생성/완료', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncAccount(1, 'user-1')

            expect(result.added).toBeGreaterThanOrEqual(0)
            expect(deps.db.createSyncLog).toHaveBeenCalledTimes(1)
            expect(deps.db.updateSyncLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'success' }))
            expect(accountService.updateSyncStatus).toHaveBeenCalledWith(1, 'success')
        })

        test('새 메시지와 업데이트를 구분하여 카운트한다', async () => {
            const accountService = createMockAccountService()
            let callCount = 0
            const deps = createDeps({
                accountService,
                db: {
                    upsertMessage: mock(() => {
                        callCount++
                        return Promise.resolve({ id: callCount, isNew: callCount === 1 })
                    }),
                },
            })
            const service = createMailSyncService(deps)
            const result = await service.syncAccount(1, 'user-1')

            expect(result.added).toBe(1)
            expect(result.updated).toBe(1)
        })

        test('삭제 처리', async () => {
            const accountService = createMockAccountService()
            accountService._provider.fetchMessages = mock(() =>
                Promise.resolve({
                    messages: [],
                    deletedIds: ['del-1', 'del-2'],
                    newSyncCursor: 'cursor',
                }),
            )
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncAccount(1, 'user-1')

            expect(result.deleted).toBe(2)
            expect(deps.db.deleteMessagesByRemoteIds).toHaveBeenCalledWith(1, ['del-1', 'del-2'])
        })

        test('스테일 running 세션이 있어도 정상 진행한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService,
                db: { getActiveSession: mock(() => Promise.resolve(mockSession({ status: 'running' }))) },
            })
            const service = createMailSyncService(deps)
            const result = await service.syncAccount(1, 'user-1')

            expect(deps.db.updateSession).toHaveBeenCalledWith(1, { status: 'error' })
            expect(result.added).toBeGreaterThanOrEqual(0)
        })

        test('삭제된 메시지와 새 메시지를 동시에 처리한다', async () => {
            const accountService = createMockAccountService()
            accountService._provider.fetchMessages = mock(() =>
                Promise.resolve({
                    messages: [mockMessage('new-1'), mockMessage('new-2')],
                    deletedIds: ['del-1', 'del-3'],
                    newSyncCursor: 'cursor-mix',
                }),
            )
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncAccount(1, 'user-1')

            expect(result.added).toBeGreaterThanOrEqual(0)
            expect(result.deleted).toBe(2)
            expect(deps.db.deleteMessagesByRemoteIds).toHaveBeenCalledWith(1, ['del-1', 'del-3'])
            expect(deps.db.upsertMessage).toHaveBeenCalledTimes(2)
        })

        test('첨부파일이 있는 메시지를 처리한다', async () => {
            const accountService = createMockAccountService()
            const msgWithAttachment = {
                ...mockMessage('msg-att-1'),
                attachments: [
                    { id: 'att-1', filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 2048, contentId: null, isInline: false },
                    { id: 'att-2', filename: 'img.png', mimeType: 'image/png', sizeBytes: 4096, contentId: 'cid-1', isInline: true },
                ],
            }
            accountService._provider.fetchMessages = mock(() =>
                Promise.resolve({
                    messages: [msgWithAttachment],
                    deletedIds: [],
                    newSyncCursor: 'cursor-att',
                }),
            )
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            await service.syncAccount(1, 'user-1')

            expect(deps.db.upsertAttachment).toHaveBeenCalledTimes(2)
            expect(deps.db.upsertAttachment).toHaveBeenCalledWith(expect.objectContaining({ filename: 'doc.pdf', isInline: false }))
            expect(deps.db.upsertAttachment).toHaveBeenCalledWith(expect.objectContaining({ filename: 'img.png', isInline: true }))
        })

        test('에러 시 error 상태로 로그 업데이트', async () => {
            const accountService = createMockAccountService()
            accountService._provider.connect = mock(() => Promise.reject(new Error('Connection failed')))
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)

            await expect(service.syncAccount(1, 'user-1')).rejects.toMatchObject({
                code: 'MAIL_PROVIDER_ERROR',
            })
            expect(deps.db.updateSyncLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'error', errorMessage: 'Connection failed' }))
            expect(accountService.updateSyncStatus).toHaveBeenCalledWith(1, 'error')
        })
    })

    describe('syncHistorical', () => {
        test('세션을 생성하고 메시지를 동기화한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncHistorical(1, 'user-1', {})

            expect(result.synced).toBeGreaterThanOrEqual(0)
            expect(result.hasMore).toBe(true)
            expect(result.cursor).toBe('new-cursor')
            expect(deps.db.createSession).toHaveBeenCalledTimes(1)
        })

        test('기존 세션을 재개한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService,
                db: { getActiveSession: mock(() => Promise.resolve(mockSession({ status: 'paused' }))) },
            })
            const service = createMailSyncService(deps)
            await service.syncHistorical(1, 'user-1', {})

            expect(deps.db.createSession).not.toHaveBeenCalled()
            expect(deps.db.updateSession).toHaveBeenCalled()
        })

        test('커서 없으면 completed', async () => {
            const accountService = createMockAccountService()
            accountService._provider.fetchMessages = mock(() =>
                Promise.resolve({
                    messages: [],
                    deletedIds: [],
                    newSyncCursor: null,
                }),
            )
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncHistorical(1, 'user-1', {})

            expect(result.hasMore).toBe(false)
            expect(deps.db.updateSession).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'completed' }))
        })

        test('커서 있으면 paused 상태로 저장한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncHistorical(1, 'user-1', {})

            expect(result.hasMore).toBe(true)
            expect(deps.db.updateSession).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'paused' }))
        })

        test('inbox 자동 선택', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.syncHistorical(1, 'user-1', {})

            expect(result.folderId).toBeDefined()
        })

        test('fetchMessages에 direction: backward를 전달한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            await service.syncHistorical(1, 'user-1', {})

            expect(accountService._provider.fetchMessages).toHaveBeenCalledWith(expect.objectContaining({ direction: 'backward' }))
        })

        test('스테일 running 세션을 리셋하고 새 세션을 생성한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService,
                db: { getActiveSession: mock(() => Promise.resolve(mockSession({ status: 'running' }))) },
            })
            const service = createMailSyncService(deps)
            await service.syncHistorical(1, 'user-1', {})

            expect(deps.db.updateSession).toHaveBeenCalledWith(1, { status: 'error' })
            expect(deps.db.createSession).toHaveBeenCalledTimes(1)
        })

        test('에러 시 세션 error 상태', async () => {
            const accountService = createMockAccountService()
            accountService._provider.fetchMessages = mock(() => Promise.reject(new Error('Fetch failed')))
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)

            await expect(service.syncHistorical(1, 'user-1', {})).rejects.toMatchObject({
                code: 'MAIL_PROVIDER_ERROR',
            })
            expect(deps.db.updateSession).toHaveBeenCalledWith(1, { status: 'error' })
        })
    })

    describe('getSyncStatus', () => {
        test('진행률을 계산한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService,
                db: {
                    getActiveSession: mock(() => Promise.resolve(mockSession({ totalEstimate: 100, syncedCount: 50 }))),
                },
            })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.historicalSync).not.toBeNull()
            expect(result.historicalSync!.progressPercent).toBe(50)
        })

        test('totalEstimate null이면 progressPercent null', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({
                accountService,
                db: {
                    getActiveSession: mock(() => Promise.resolve(mockSession({ totalEstimate: null, syncedCount: 10 }))),
                },
            })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.historicalSync!.progressPercent).toBeNull()
        })

        test('30분 이상 무활동 세션은 error 로 만료시키고 historicalSync null 반환', async () => {
            const accountService = createMockAccountService()
            const staleDate = new Date(Date.now() - 31 * 60 * 1000)
            const updateSession = mock(() => Promise.resolve())
            const deps = createDeps({
                accountService,
                db: {
                    getActiveSession: mock(() => Promise.resolve(mockSession({ status: 'paused', startedAt: staleDate, lastBatchAt: staleDate }))),
                    updateSession,
                },
            })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.historicalSync).toBeNull()
            expect(updateSession).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'error' }))
        })

        test('최근 활동한 세션은 만료시키지 않는다', async () => {
            const accountService = createMockAccountService()
            const updateSession = mock(() => Promise.resolve())
            const deps = createDeps({
                accountService,
                db: {
                    getActiveSession: mock(() => Promise.resolve(mockSession({ status: 'paused', lastBatchAt: new Date() }))),
                    updateSession,
                },
            })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.historicalSync).not.toBeNull()
            expect(updateSession).not.toHaveBeenCalled()
        })

        test('세션 없으면 historicalSync null', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.historicalSync).toBeNull()
        })

        test('latestLog를 반환한다', async () => {
            const accountService = createMockAccountService()
            const deps = createDeps({ accountService })
            const service = createMailSyncService(deps)
            const result = await service.getSyncStatus(1, 'user-1')

            expect(result.latestLog).not.toBeNull()
            expect(result.latestLog!.status).toBe('success')
        })
    })
})
