import { describe, expect, test, mock } from 'bun:test'
import { createAiConnectionService } from '../../../../service/domain/ai/ai-connection'
import type { AiConnectionInsert } from '../../../../service/domain/ai/ai-connection'
import type { StoredCodexCredentials, StoredApiKeyCredentials } from '../../../../service/domain/ai/ai-provider-factory'
import { createCredentialCrypto } from '../../../../lib/credential-crypto'
import type { AiProvider } from '../../../../db/schema'

const crypto = createCredentialCrypto('0'.repeat(32))

const buildProvider = (over: Partial<AiProvider> = {}): AiProvider => ({
    id: 1,
    userId: 'user-1',
    provider: 'anthropic',
    authType: 'apikey',
    credentials: 'v2:stored',
    status: 'active',
    statusDetail: null,
    displayName: null,
    lastUsedAt: null,
    lastRefreshedAt: null,
    modelsFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
})

const createClient = (over: Partial<{ ok: boolean; error: string }> = {}) => ({
    verify: mock(async () => ({ ok: over.ok ?? true, error: over.error })),
    listModels: mock(async () => []),
    complete: mock(async () => ({ content: '', modelId: 'm', inputTokens: null, outputTokens: null })),
})

const createMockDb = () => ({
    getByUserAndProvider: mock(async (_userId: string, _provider: string): Promise<AiProvider | null> => null),
    getById: mock(async (id: number) => buildProvider({ id })),
    listByUser: mock(async (_userId: string) => [buildProvider()]),
    insert: mock(async (_data: AiConnectionInsert) => ({ id: 1 })),
    updateCredentials: mock(async (_id: number, _encrypted: string) => {}),
    updateStatus: mock(async (_id: number, _status: string, _detail: string | null) => {}),
    updateDisplayName: mock(async (_id: number, _displayName: string | null) => {}),
    touchUsed: mock(async (_id: number) => {}),
    touchModelsFetched: mock(async (_id: number) => {}),
    remove: mock(async (_id: number) => {}),
})

const createFactory = (client: ReturnType<typeof createClient>) => ({
    createFromStored: mock((_provider: string, _stored: StoredCodexCredentials | StoredApiKeyCredentials) => client),
    create: mock((_row: AiProvider) => client),
})

describe('createAiConnectionService', () => {
    describe('connect', () => {
        test('anthropic apikey를 검증·암호화해 신규 insert한다', async () => {
            const db = createMockDb()
            const client = createClient({ ok: true })
            const factory = createFactory(client)
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await service.connect('user-1', { provider: 'anthropic', credentials: { apiKey: 'sk-test' } })

            expect(client.verify).toHaveBeenCalled()
            const insertArg = db.insert.mock.calls[0][0]
            expect(insertArg.provider).toBe('anthropic')
            expect(insertArg.authType).toBe('apikey')
            expect(insertArg.status).toBe('active')
            expect(insertArg.credentials.startsWith('v2:')).toBe(true)
            expect(JSON.parse(crypto.decrypt(insertArg.credentials))).toEqual({ apiKey: 'sk-test' })
        })

        test('기존 provider가 있으면 updateCredentials·updateStatus로 갱신하고 insert하지 않는다', async () => {
            const db = createMockDb()
            db.getByUserAndProvider = mock(async (_userId: string, _provider: string) => buildProvider({ id: 5 }))
            const client = createClient({ ok: true })
            const factory = createFactory(client)
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await service.connect('user-1', { provider: 'anthropic', credentials: { apiKey: 'sk-test' } })

            expect(db.updateCredentials).toHaveBeenCalled()
            expect(db.updateCredentials.mock.calls[0][0]).toBe(5)
            expect(db.updateStatus).toHaveBeenCalledWith(5, 'active', null)
            expect(db.insert).not.toHaveBeenCalled()
        })

        test('verify 실패({ok:false})면 AI_CREDENTIALS_INVALID을 throw한다', async () => {
            const db = createMockDb()
            const client = createClient({ ok: false, error: 'bad key' })
            const factory = createFactory(client)
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.connect('user-1', { provider: 'anthropic', credentials: { apiKey: 'sk-test' } })).rejects.toMatchObject({
                code: 'AI_CREDENTIALS_INVALID',
            })
            expect(db.insert).not.toHaveBeenCalled()
        })

        test('codex는 accountId도 없고 id_token claim도 없으면 AI_CREDENTIALS_INVALID을 throw한다', async () => {
            const db = createMockDb()
            const client = createClient({ ok: true })
            const factory = createFactory(client)
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(
                service.connect('user-1', {
                    provider: 'codex',
                    credentials: { idToken: 'not-a-jwt', accessToken: 'at', refreshToken: 'rt' },
                }),
            ).rejects.toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
            expect(factory.createFromStored).not.toHaveBeenCalled()
        })
    })

    describe('update / remove', () => {
        test('update는 없는 provider에 AI_PROVIDER_NOT_FOUND를 throw한다', async () => {
            const db = createMockDb()
            db.getById = mock(async (_id: number) => null)
            const factory = createFactory(createClient())
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.update('user-1', 1, { displayName: 'x' })).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_FOUND' })
        })

        test('remove는 타 유저 provider에 AI_PROVIDER_NOT_FOUND를 throw한다', async () => {
            const db = createMockDb()
            db.getById = mock(async (id: number) => buildProvider({ id, userId: 'other' }))
            const factory = createFactory(createClient())
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.remove('user-1', 1)).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_FOUND' })
            expect(db.remove).not.toHaveBeenCalled()
        })
    })

    describe('resolveClient', () => {
        test('status가 reauth_required면 AI_REAUTH_REQUIRED를 throw한다', async () => {
            const db = createMockDb()
            db.getByUserAndProvider = mock(async (_userId: string, _provider: string) => buildProvider({ status: 'reauth_required' }))
            const factory = createFactory(createClient())
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.resolveClient('user-1', 'anthropic')).rejects.toMatchObject({ code: 'AI_REAUTH_REQUIRED' })
        })

        test('status가 disabled면 AI_PROVIDER_NOT_FOUND를 throw한다', async () => {
            const db = createMockDb()
            db.getByUserAndProvider = mock(async (_userId: string, _provider: string) => buildProvider({ status: 'disabled' }))
            const factory = createFactory(createClient())
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.resolveClient('user-1', 'anthropic')).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_FOUND' })
        })

        test('row가 없으면 AI_PROVIDER_NOT_FOUND를 throw한다', async () => {
            const db = createMockDb()
            db.getByUserAndProvider = mock(async (_userId: string, _provider: string): Promise<AiProvider | null> => null)
            const factory = createFactory(createClient())
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            await expect(service.resolveClient('user-1', 'anthropic')).rejects.toMatchObject({ code: 'AI_PROVIDER_NOT_FOUND' })
        })

        test('active면 factory.create로 client를 만들어 row와 함께 반환한다', async () => {
            const db = createMockDb()
            const row = buildProvider({ status: 'active' })
            db.getByUserAndProvider = mock(async (_userId: string, _provider: string) => row)
            const client = createClient()
            const factory = createFactory(client)
            const service = createAiConnectionService({ db: db as never, crypto, factory: factory as never })

            const result = await service.resolveClient('user-1', 'anthropic')
            expect(factory.create).toHaveBeenCalledWith(row)
            expect(result.row).toBe(row)
            expect(result.client).toBe(client)
        })
    })
})
