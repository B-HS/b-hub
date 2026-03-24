import { describe, expect, test, mock } from 'bun:test'
import { createMailAccountService } from '../../../../service/domain/mail/mail-account'

const mockAccount = (overrides = {}) => ({
    id: 1,
    userId: 'user-1',
    provider: 'gmail',
    email: 'test@gmail.com',
    displayName: null,
    credentials: null,
    imapHost: null,
    imapPort: null,
    imapTls: true,
    smtpHost: null,
    smtpPort: null,
    smtpTls: true,
    isActive: true,
    lastSyncAt: null,
    lastSyncStatus: 'pending',
    syncCursor: null,
    betterAuthAccountId: 'ba-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const createMockDb = () => ({
    list: mock(() => Promise.resolve([mockAccount()])),
    getById: mock((id: number) => Promise.resolve(id === 1 ? mockAccount() : null)),
    insert: mock(() => Promise.resolve({ id: 2 })),
    update: mock(() => Promise.resolve()),
    remove: mock(() => Promise.resolve()),
    countByUser: mock(() => Promise.resolve(1)),
})

const createMockCrypto = () => ({
    encrypt: mock((text: string) => `encrypted:${text}`),
    decrypt: mock((text: string) => text.replace('encrypted:', '')),
})

const createMockProviderFactory = () => ({
    create: mock(() => ({
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
        downloadAttachment: mock(() => Promise.resolve({ content: Buffer.from(''), filename: '', mimeType: '' })),
        sendMessage: mock(() => Promise.resolve({ messageId: 'msg-1' })),
    })),
})

const createDeps = (overrides: { db?: Partial<ReturnType<typeof createMockDb>>; crypto?: Partial<ReturnType<typeof createMockCrypto>>; providerFactory?: Partial<ReturnType<typeof createMockProviderFactory>>; verifyBetterAuthOwnership?: (id: string, userId: string) => Promise<boolean> } = {}) => ({
    db: { ...createMockDb(), ...overrides.db } as ReturnType<typeof createMockDb>,
    crypto: { ...createMockCrypto(), ...overrides.crypto } as ReturnType<typeof createMockCrypto>,
    providerFactory: { ...createMockProviderFactory(), ...overrides.providerFactory } as ReturnType<typeof createMockProviderFactory>,
    verifyBetterAuthOwnership: overrides.verifyBetterAuthOwnership,
})

describe('createMailAccountService', () => {
    describe('list', () => {
        test('계정 목록을 반환한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            const result = await service.list('user-1')
            expect(result).toHaveLength(1)
            expect(deps.db.list).toHaveBeenCalledWith('user-1')
        })
    })

    describe('getById', () => {
        test('소유한 계정을 반환한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            const result = await service.getById(1, 'user-1')
            expect(result.id).toBe(1)
        })

        test('없는 계정은 에러를 발생시킨다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await expect(service.getById(999, 'user-1')).rejects.toMatchObject({
                code: 'MAIL_ACCOUNT_NOT_FOUND',
            })
        })

        test('다른 사용자의 계정은 에러를 발생시킨다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await expect(service.getById(1, 'user-2')).rejects.toMatchObject({
                code: 'MAIL_ACCOUNT_NOT_FOUND',
            })
        })
    })

    describe('create', () => {
        test('계정을 생성한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            const result = await service.create('user-1', {
                provider: 'gmail',
                email: 'new@gmail.com',
                betterAuthAccountId: 'ba-2',
            })
            expect(result).toEqual({ id: 2 })
            expect(deps.db.insert).toHaveBeenCalledTimes(1)
        })

        test('credentials가 있으면 암호화한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.create('user-1', {
                provider: 'naver',
                email: 'test@naver.com',
                credentials: { password: 'secret' },
            })
            expect(deps.crypto.encrypt).toHaveBeenCalledTimes(1)
            const insertCall = deps.db.insert.mock.calls[0][0] as Record<string, unknown>
            expect(insertCall.credentials).toContain('encrypted:')
        })

        test('credentials가 없으면 null', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.create('user-1', {
                provider: 'gmail',
                email: 'test@gmail.com',
            })
            const insertCall = deps.db.insert.mock.calls[0][0] as Record<string, unknown>
            expect(insertCall.credentials).toBeNull()
        })

        test('계정 수가 제한 미만이면 생성에 성공한다', async () => {
            const deps = createDeps({ db: { countByUser: mock(() => Promise.resolve(9)) } })
            const service = createMailAccountService(deps)
            const result = await service.create('user-1', { provider: 'gmail', email: 'test@gmail.com' })
            expect(result).toEqual({ id: 2 })
            expect(deps.db.insert).toHaveBeenCalledTimes(1)
        })

        test('10개 제한 초과 시 에러를 발생시킨다', async () => {
            const deps = createDeps({ db: { countByUser: mock(() => Promise.resolve(10)) } })
            const service = createMailAccountService(deps)
            await expect(
                service.create('user-1', { provider: 'gmail', email: 'test@gmail.com' }),
            ).rejects.toMatchObject({ code: 'MAIL_ACCOUNT_LIMIT_EXCEEDED' })
        })

        test('betterAuthAccountId 소유권 검증을 통과한다', async () => {
            const deps = createDeps({
                verifyBetterAuthOwnership: mock(() => Promise.resolve(true)),
            })
            const service = createMailAccountService(deps)
            const result = await service.create('user-1', {
                provider: 'gmail',
                email: 'test@gmail.com',
                betterAuthAccountId: 'ba-1',
            })
            expect(result).toEqual({ id: 2 })
        })

        test('betterAuthAccountId 소유권 검증 실패 시 에러를 발생시킨다', async () => {
            const deps = createDeps({
                verifyBetterAuthOwnership: mock(() => Promise.resolve(false)),
            })
            const service = createMailAccountService(deps)
            await expect(
                service.create('user-1', {
                    provider: 'gmail',
                    email: 'test@gmail.com',
                    betterAuthAccountId: 'ba-other-user',
                }),
            ).rejects.toMatchObject({ code: 'MAIL_OAUTH_ACCOUNT_MISMATCH' })
        })

        test('verifyBetterAuthOwnership 미설정 시 검증을 건너뛴다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            const result = await service.create('user-1', {
                provider: 'gmail',
                email: 'test@gmail.com',
                betterAuthAccountId: 'ba-any',
            })
            expect(result).toEqual({ id: 2 })
        })
    })

    describe('update', () => {
        test('displayName을 수정한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.update(1, 'user-1', { displayName: 'New Name' })
            expect(deps.db.update).toHaveBeenCalledWith(1, { displayName: 'New Name' })
        })

        test('isActive를 수정한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.update(1, 'user-1', { isActive: false })
            expect(deps.db.update).toHaveBeenCalledWith(1, { isActive: false })
        })

        test('displayName과 isActive를 동시에 수정한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.update(1, 'user-1', { displayName: 'Updated', isActive: false })
            expect(deps.db.update).toHaveBeenCalledWith(1, { displayName: 'Updated', isActive: false })
        })

        test('소유권 검증 실패 시 에러를 발생시킨다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await expect(service.update(1, 'user-2', { displayName: 'x' })).rejects.toMatchObject({
                code: 'MAIL_ACCOUNT_NOT_FOUND',
            })
        })
    })

    describe('remove', () => {
        test('계정을 삭제한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.remove(1, 'user-1')
            expect(deps.db.remove).toHaveBeenCalledWith(1)
        })

        test('소유권 검증 실패 시 에러를 발생시킨다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await expect(service.remove(1, 'user-2')).rejects.toMatchObject({
                code: 'MAIL_ACCOUNT_NOT_FOUND',
            })
        })
    })

    describe('testConnection', () => {
        test('프로바이더 결과를 반환한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            const result = await service.testConnection(1, 'user-1')
            expect(result).toEqual({ success: true })
        })
    })

    describe('updateSyncStatus', () => {
        test('syncCursor 없이 상태를 업데이트한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.updateSyncStatus(1, 'success')
            const call = deps.db.update.mock.calls[0] as unknown[]
            expect(call[0]).toBe(1)
            const data = call[1] as Record<string, unknown>
            expect(data.lastSyncStatus).toBe('success')
            expect(data.syncCursor).toBeUndefined()
        })

        test('syncCursor와 함께 상태를 업데이트한다', async () => {
            const deps = createDeps()
            const service = createMailAccountService(deps)
            await service.updateSyncStatus(1, 'success', 'cursor-123')
            const call = deps.db.update.mock.calls[0] as unknown[]
            const data = call[1] as Record<string, unknown>
            expect(data.syncCursor).toBe('cursor-123')
        })
    })

    describe('getProvider', () => {
        test('providerFactory 에러가 전파된다', async () => {
            const deps = createDeps({
                providerFactory: {
                    create: mock(() => {
                        throw new Error('Provider creation failed')
                    }),
                },
            })
            const service = createMailAccountService(deps)
            await expect(service.getProvider(1, 'user-1')).rejects.toThrow('Provider creation failed')
        })
    })
})
