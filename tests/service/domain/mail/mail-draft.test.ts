import { describe, expect, test, mock } from 'bun:test'
import { createMailDraftService } from '../../../../service/domain/mail/mail-draft'

const mockDraftsFolder = (overrides = {}) => ({
    id: 9,
    accountId: 1,
    remoteFolderId: '__local_drafts__',
    name: 'Drafts',
    type: 'drafts',
    parentId: null,
    messageCount: 0,
    unreadCount: 0,
    uidValidity: null,
    syncCursor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const mockMessage = (overrides = {}) => ({
    id: 100,
    accountId: 1,
    folderId: 9,
    remoteMessageId: 'local-draft:uuid-1',
    messageIdHeader: null,
    threadId: null,
    inReplyTo: null,
    referencesHeader: null,
    fromAddress: { name: 'Me', address: 'me@test.com' },
    toAddresses: [{ name: 'To', address: 'to@test.com' }],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Draft subject',
    bodyHtml: '<p>Draft</p>',
    bodyText: 'Draft',
    snippet: 'Draft',
    isRead: true,
    isStarred: false,
    isDraft: true,
    hasAttachments: false,
    sentAt: null,
    receivedAt: new Date(),
    uid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const createMockDb = () => ({
    findDraftsFolder: mock(() => Promise.resolve(mockDraftsFolder())),
    createDraftsFolder: mock(() => Promise.resolve(mockDraftsFolder())),
    insertDraft: mock(() => Promise.resolve({ id: 100 })),
    getMessageById: mock((id: number) => Promise.resolve(id === 100 ? mockMessage() : null)),
    updateDraft: mock(() => Promise.resolve()),
    deleteById: mock(() => Promise.resolve()),
    countMessagesByFolder: mock(() => Promise.resolve(1)),
    countUnreadByFolder: mock(() => Promise.resolve(0)),
    updateFolderCounts: mock(() => Promise.resolve()),
})

const createMockAccountService = () =>
    ({
        list: mock(() => Promise.resolve([{ id: 1, userId: 'user-1' }])),
        getById: mock(() => Promise.resolve({ id: 1, userId: 'user-1', email: 'me@test.com', displayName: 'Me' })),
        create: mock(() => Promise.resolve({ id: 1 })),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        testConnection: mock(() => Promise.resolve({ success: true })),
        getProvider: mock(() => Promise.resolve({ provider: {}, account: { id: 1 } })),
        updateSyncStatus: mock(() => Promise.resolve()),
    }) as never

const createDeps = (
    overrides: {
        db?: Partial<ReturnType<typeof createMockDb>>
        accountService?: unknown
    } = {},
) => ({
    db: { ...createMockDb(), ...overrides.db } as ReturnType<typeof createMockDb>,
    accountService: (overrides.accountService ?? createMockAccountService()) as never,
    generateId: () => 'uuid-1',
})

describe('createMailDraftService', () => {
    describe('createDraft', () => {
        test('임시보관 메일을 생성한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            const result = await service.createDraft('user-1', {
                accountId: 1,
                to: [{ name: 'To', address: 'to@test.com' }],
                cc: [],
                bcc: [],
                subject: 'Draft subject',
                bodyHtml: '<p>Draft</p>',
            })
            expect(result.id).toBe(100)
            expect(result.isDraft).toBe(true)
        })

        test('isDraft=true, isRead=true, drafts 폴더 id로 저장한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            await service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: '' })
            const insertArg = deps.db.insertDraft.mock.calls[0][0] as Record<string, unknown>
            expect(insertArg.isDraft).toBe(true)
            expect(insertArg.isRead).toBe(true)
            expect(insertArg.folderId).toBe(9)
            expect(insertArg.receivedAt).toBeInstanceOf(Date)
            expect(insertArg.sentAt).toBeNull()
        })

        test('발신자를 계정 이메일로 채운다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            await service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: '' })
            const insertArg = deps.db.insertDraft.mock.calls[0][0] as Record<string, unknown>
            expect(insertArg.fromAddress).toEqual({ name: 'Me', address: 'me@test.com' })
        })

        test('drafts 폴더가 없으면 로컬 drafts 폴더를 생성한다', async () => {
            const deps = createDeps({ db: { findDraftsFolder: mock(() => Promise.resolve(null)) } })
            const service = createMailDraftService(deps)
            await service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: '' })
            expect(deps.db.createDraftsFolder).toHaveBeenCalledTimes(1)
            const folderArg = deps.db.createDraftsFolder.mock.calls[0][0] as Record<string, unknown>
            expect(folderArg.type).toBe('drafts')
            expect(folderArg.remoteFolderId).toBe('__local_drafts__')
        })

        test('계정 소유권이 없으면 에러가 전파된다', async () => {
            const accountService = {
                ...createMockAccountService(),
                getById: mock(() => Promise.reject({ code: 'MAIL_ACCOUNT_NOT_FOUND', message: 'x', statusCode: 404 })),
            }
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailDraftService(deps)
            await expect(service.createDraft('user-2', { accountId: 1, to: [], cc: [], bcc: [], subject: '' })).rejects.toMatchObject({
                code: 'MAIL_ACCOUNT_NOT_FOUND',
            })
        })

        test('replyToMessageId로 스레딩 헤더를 원본에서 도출한다', async () => {
            const original = mockMessage({
                id: 5,
                isDraft: false,
                messageIdHeader: '<orig@test.com>',
                referencesHeader: '<root@test.com>',
                threadId: 'thread-abc',
            })
            const deps = createDeps({
                db: {
                    getMessageById: mock((id: number) =>
                        Promise.resolve(id === 5 ? original : id === 100 ? mockMessage({ threadId: 'thread-abc' }) : null),
                    ),
                },
            })
            const service = createMailDraftService(deps)
            await service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: 'Re', replyToMessageId: 5 })
            const insertArg = deps.db.insertDraft.mock.calls[0][0] as Record<string, unknown>
            expect(insertArg.inReplyTo).toBe('<orig@test.com>')
            expect(insertArg.referencesHeader).toContain('<orig@test.com>')
            expect(insertArg.threadId).toBe('thread-abc')
        })

        test('replyToMessageId 원본이 없으면 MAIL_MESSAGE_NOT_FOUND', async () => {
            const deps = createDeps({ db: { getMessageById: mock(() => Promise.resolve(null)) } })
            const service = createMailDraftService(deps)
            await expect(
                service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: '', replyToMessageId: 999 }),
            ).rejects.toMatchObject({ code: 'MAIL_MESSAGE_NOT_FOUND' })
        })

        test('폴더 카운트를 갱신한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            await service.createDraft('user-1', { accountId: 1, to: [], cc: [], bcc: [], subject: '' })
            expect(deps.db.updateFolderCounts).toHaveBeenCalledWith(9, 1, 0)
        })
    })

    describe('updateDraft', () => {
        test('전달한 필드만 매핑해 업데이트한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            await service.updateDraft('user-1', 100, { subject: 'New', to: [{ name: 'T', address: 't@test.com' }] })
            const updateArg = deps.db.updateDraft.mock.calls[0][1] as Record<string, unknown>
            expect(updateArg.subject).toBe('New')
            expect(updateArg.toAddresses).toEqual([{ name: 'T', address: 't@test.com' }])
        })

        test('본문 변경 시 snippet을 재계산한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            await service.updateDraft('user-1', 100, { bodyText: 'Updated body' })
            const updateArg = deps.db.updateDraft.mock.calls[0][1] as Record<string, unknown>
            expect(updateArg.snippet).toBe('Updated body')
        })

        test('draft가 아닌 메시지는 MAIL_MESSAGE_NOT_FOUND', async () => {
            const deps = createDeps({ db: { getMessageById: mock(() => Promise.resolve(mockMessage({ isDraft: false }))) } })
            const service = createMailDraftService(deps)
            await expect(service.updateDraft('user-1', 100, { subject: 'x' })).rejects.toMatchObject({ code: 'MAIL_MESSAGE_NOT_FOUND' })
        })

        test('소유하지 않은 draft는 MAIL_MESSAGE_NOT_FOUND', async () => {
            const accountService = { ...createMockAccountService(), list: mock(() => Promise.resolve([{ id: 2, userId: 'user-2' }])) }
            const deps = createDeps({ accountService: accountService as never })
            const service = createMailDraftService(deps)
            await expect(service.updateDraft('user-2', 100, { subject: 'x' })).rejects.toMatchObject({ code: 'MAIL_MESSAGE_NOT_FOUND' })
        })

        test('없는 draft는 MAIL_MESSAGE_NOT_FOUND', async () => {
            const deps = createDeps({ db: { getMessageById: mock(() => Promise.resolve(null)) } })
            const service = createMailDraftService(deps)
            await expect(service.updateDraft('user-1', 999, { subject: 'x' })).rejects.toMatchObject({ code: 'MAIL_MESSAGE_NOT_FOUND' })
        })
    })

    describe('deleteDraft', () => {
        test('draft를 삭제하고 폴더 카운트를 갱신한다', async () => {
            const deps = createDeps()
            const service = createMailDraftService(deps)
            const result = await service.deleteDraft('user-1', 100)
            expect(result).toEqual({ deleted: true })
            expect(deps.db.deleteById).toHaveBeenCalledWith(100)
            expect(deps.db.updateFolderCounts).toHaveBeenCalledWith(9, 1, 0)
        })

        test('draft가 아니면 삭제하지 않고 MAIL_MESSAGE_NOT_FOUND', async () => {
            const deps = createDeps({ db: { getMessageById: mock(() => Promise.resolve(mockMessage({ isDraft: false }))) } })
            const service = createMailDraftService(deps)
            await expect(service.deleteDraft('user-1', 100)).rejects.toMatchObject({ code: 'MAIL_MESSAGE_NOT_FOUND' })
            expect(deps.db.deleteById).not.toHaveBeenCalled()
        })
    })
})
