import { describe, expect, test, mock } from 'bun:test'
import type { AiProvider } from '../../../../db/schema'
import { createCredentialCrypto } from '../../../../lib/credential-crypto'
import {
    createAiProviderFactory,
    getCodexAccountId,
    type CodexRefreshResult,
    type StoredApiKeyCredentials,
    type StoredCodexCredentials,
} from '../../../../service/domain/ai/ai-provider-factory'

const CRYPTO_KEY = 'a'.repeat(32)

const base64url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url')

const buildJwt = (payload: Record<string, unknown>) => `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.sig`

const nowSec = () => Math.floor(Date.now() / 1000)

const jsonOk = (data: Record<string, unknown>) =>
    ({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) }) as unknown as Response

const httpErr = (status: number, body = 'provider error') =>
    ({ ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(body) }) as unknown as Response

const buildRow = (overrides: Partial<AiProvider>): AiProvider => ({
    id: 42,
    userId: 'user-1',
    provider: 'codex',
    authType: 'oauth',
    credentials: '',
    status: 'active',
    statusDetail: null,
    displayName: null,
    lastUsedAt: null,
    lastRefreshedAt: null,
    modelsFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const catchError = (fn: () => unknown) => {
    try {
        fn()
        return null
    } catch (error) {
        return error as { code?: string }
    }
}

describe('getCodexAccountId', () => {
    test('id_token의 auth 클레임에서 chatgpt_account_id를 추출한다', () => {
        const idToken = buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-77' } })
        expect(getCodexAccountId(idToken)).toBe('acct-77')
    })

    test('auth 클레임이 없으면 null을 반환한다', () => {
        expect(getCodexAccountId(buildJwt({ sub: 'x' }))).toBeNull()
    })

    test('chatgpt_account_id가 없으면 null을 반환한다', () => {
        expect(getCodexAccountId(buildJwt({ 'https://api.openai.com/auth': { other: 'y' } }))).toBeNull()
    })

    test('잘못된 토큰이면 null을 반환한다', () => {
        expect(getCodexAccountId('not-a-jwt')).toBeNull()
    })
})

const buildFactory = (overrides: Partial<Parameters<typeof createAiProviderFactory>[0]> = {}) =>
    createAiProviderFactory({
        crypto: createCredentialCrypto(CRYPTO_KEY),
        refreshCodexToken: mock(() => Promise.resolve<CodexRefreshResult>({ accessToken: '', refreshToken: null, idToken: null })),
        persistCodexCredentials: mock(async () => {}),
        markReauthRequired: mock(async () => {}),
        fetchFn: mock(() => Promise.resolve(jsonOk({ models: [{ slug: 'gpt-5.1-codex' }] }))),
        ...overrides,
    })

describe('createAiProviderFactory.resolveCodexAccountId', () => {
    const whoamiOk = (accountId: string) => mock(() => Promise.resolve(jsonOk({ chatgpt_account_id: accountId })))

    test('입력 accountId가 있으면 그대로 쓰고 whoami를 호출하지 않는다(입력 우선)', async () => {
        const fetchFn = whoamiOk('acct-whoami')
        const factory = buildFactory({ fetchFn })
        expect(await factory.resolveCodexAccountId('at-opaque', 'acct-input')).toBe('acct-input')
        expect(fetchFn).not.toHaveBeenCalled()
    })

    test('JWT access_token이면 claim에서 accountId를 확정하고 whoami를 호출하지 않는다', async () => {
        const fetchFn = whoamiOk('acct-whoami')
        const factory = buildFactory({ fetchFn })
        const accessToken = buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-claim' } })
        expect(await factory.resolveCodexAccountId(accessToken)).toBe('acct-claim')
        expect(fetchFn).not.toHaveBeenCalled()
    })

    test('at- opaque 토큰이면 whoami로 chatgpt_account_id를 조회한다', async () => {
        const fetchFn = whoamiOk('acct-whoami')
        const factory = buildFactory({ fetchFn })
        expect(await factory.resolveCodexAccountId('at-opaque-token')).toBe('acct-whoami')
        expect(fetchFn).toHaveBeenCalledTimes(1)
        expect(String((fetchFn.mock.calls[0] as unknown as [string])[0])).toContain('/whoami')
    })

    test('whoami가 401이면 AI_CREDENTIALS_INVALID를 던진다', async () => {
        const factory = buildFactory({ fetchFn: mock(() => Promise.resolve(httpErr(401))) })
        await expect(factory.resolveCodexAccountId('at-bad-token')).rejects.toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })

    test('at- 접두사가 아니고 claim도 없으면 null을 반환한다(whoami 미호출)', async () => {
        const fetchFn = whoamiOk('acct-whoami')
        const factory = buildFactory({ fetchFn })
        expect(await factory.resolveCodexAccountId('opaque-no-prefix')).toBeNull()
        expect(fetchFn).not.toHaveBeenCalled()
    })
})

describe('createAiProviderFactory.createFromStored', () => {
    test('anthropic은 apiKey가 있으면 클라이언트를 만든다', () => {
        const client = buildFactory().createFromStored('anthropic', { apiKey: 'sk-123' })
        expect(typeof client.complete).toBe('function')
        expect(typeof client.listModels).toBe('function')
    })

    test('anthropic은 apiKey가 없으면 AI_CREDENTIALS_INVALID를 던진다', () => {
        const error = catchError(() => buildFactory().createFromStored('anthropic', { apiKey: '' } as StoredApiKeyCredentials))
        expect(error).toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })

    test('ollama는 apiKey가 없으면 AI_CREDENTIALS_INVALID를 던진다', () => {
        const error = catchError(() => buildFactory().createFromStored('ollama', { apiKey: '' } as StoredApiKeyCredentials))
        expect(error).toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })

    test('알 수 없는 프로바이더는 AI_CREDENTIALS_INVALID를 던진다', () => {
        const error = catchError(() => buildFactory().createFromStored('unknown', { apiKey: 'x' }))
        expect(error).toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })

    test('codex는 accessToken이 없으면 AI_CREDENTIALS_INVALID를 던진다', () => {
        const stored: StoredCodexCredentials = { idToken: '', accessToken: '', refreshToken: 'rt', accountId: 'acct-1' }
        const error = catchError(() => buildFactory().createFromStored('codex', stored))
        expect(error).toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })
})

describe('createAiProviderFactory.create (codex refresh)', () => {
    test('자격증명 복호화에 실패하면 AI_CREDENTIALS_INVALID를 던진다', () => {
        const error = catchError(() => buildFactory().create(buildRow({ provider: 'anthropic', credentials: 'not-encrypted' })))
        expect(error).toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })

    test('access_token 만료가 임박하면 refresh 후 회전된 refresh_token을 저장한다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const stored: StoredCodexCredentials = {
            idToken: buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } }),
            accessToken: buildJwt({ exp: nowSec() + 60 }),
            refreshToken: 'old-refresh',
            accountId: 'acct-1',
        }
        const refreshCodexToken = mock(() =>
            Promise.resolve<CodexRefreshResult>({ accessToken: buildJwt({ exp: nowSec() + 3600 }), refreshToken: 'rotated-refresh', idToken: null }),
        )
        const persistCodexCredentials = mock(async () => {})
        const markReauthRequired = mock(async () => {})
        const fetchFn = mock(() => Promise.resolve(jsonOk({ models: [{ slug: 'gpt-5.1-codex' }] })))
        const factory = createAiProviderFactory({ crypto, refreshCodexToken, persistCodexCredentials, markReauthRequired, fetchFn })

        const row = buildRow({ provider: 'codex', credentials: crypto.encrypt(JSON.stringify(stored)) })
        const client = factory.create(row)
        await client.listModels()

        expect(refreshCodexToken.mock.calls.length).toBe(1)
        expect(persistCodexCredentials.mock.calls.length).toBe(1)
        expect(persistCodexCredentials.mock.calls[0][0]).toBe(row.id)
        const persisted = JSON.parse(crypto.decrypt(persistCodexCredentials.mock.calls[0][1] as string)) as StoredCodexCredentials
        expect(persisted.refreshToken).toBe('rotated-refresh')
        expect(markReauthRequired.mock.calls.length).toBe(0)
    })

    test('access_token이 아직 유효하면 refresh하지 않는다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const stored: StoredCodexCredentials = {
            idToken: '',
            accessToken: buildJwt({ exp: nowSec() + 3600 }),
            refreshToken: 'refresh',
            accountId: 'acct-1',
        }
        const refreshCodexToken = mock(() => Promise.resolve<CodexRefreshResult>({ accessToken: '', refreshToken: null, idToken: null }))
        const fetchFn = mock(() => Promise.resolve(jsonOk({ models: [{ slug: 'gpt-5.1-codex' }] })))
        const factory = createAiProviderFactory({
            crypto,
            refreshCodexToken,
            persistCodexCredentials: mock(async () => {}),
            markReauthRequired: mock(async () => {}),
            fetchFn,
        })

        const client = factory.create(buildRow({ provider: 'codex', credentials: crypto.encrypt(JSON.stringify(stored)) }))
        await client.listModels()
        expect(refreshCodexToken.mock.calls.length).toBe(0)
    })

    test('refresh가 실패하면 markReauthRequired 후 AI_REAUTH_REQUIRED를 던진다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const stored: StoredCodexCredentials = {
            idToken: buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } }),
            accessToken: buildJwt({ exp: nowSec() + 60 }),
            refreshToken: 'old-refresh',
            accountId: 'acct-1',
        }
        const refreshCodexToken = mock(() => Promise.reject(new Error('refresh boom')))
        const markReauthRequired = mock(async () => {})
        const factory = createAiProviderFactory({
            crypto,
            refreshCodexToken,
            persistCodexCredentials: mock(async () => {}),
            markReauthRequired,
            fetchFn: mock(() => Promise.resolve(jsonOk({ models: [] }))),
        })

        const row = buildRow({ provider: 'codex', credentials: crypto.encrypt(JSON.stringify(stored)) })
        const client = factory.create(row)
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_REAUTH_REQUIRED' })
        expect(markReauthRequired.mock.calls.length).toBe(1)
        expect(markReauthRequired.mock.calls[0][0]).toBe(row.id)
        expect(markReauthRequired.mock.calls[0][1]).toBe('refresh boom')
    })
})

describe('createAiProviderFactory.create (codex refresh 엣지케이스)', () => {
    const codexRow = (crypto: ReturnType<typeof createCredentialCrypto>, accessToken: string, refreshToken = 'rt-old') =>
        buildRow({
            provider: 'codex',
            credentials: crypto.encrypt(
                JSON.stringify({
                    idToken: buildJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } }),
                    accessToken,
                    refreshToken,
                    accountId: 'acct-1',
                }),
            ),
        })

    test('동시 요청이 같은 만료 토큰으로 refresh하면 refreshCodexToken은 1번만 호출된다(single-flight)', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const refreshCodexToken = mock(
            () =>
                new Promise<CodexRefreshResult>((resolve) =>
                    setTimeout(() => resolve({ accessToken: buildJwt({ exp: nowSec() + 3600 }), refreshToken: 'rt-new', idToken: null }), 10),
                ),
        )
        const factory = buildFactory({ crypto, refreshCodexToken })
        const client = factory.create(codexRow(crypto, buildJwt({ exp: nowSec() + 60 })))
        await Promise.all([client.listModels(), client.listModels()])
        expect(refreshCodexToken).toHaveBeenCalledTimes(1)
    })

    test('회전 토큰 저장(persist) 실패 시 markReauthRequired를 호출하되 이번 호출은 성공한다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const markReauthRequired = mock(async () => {})
        const persistCodexCredentials = mock(() => Promise.reject(new Error('db down')))
        const refreshCodexToken = mock(() =>
            Promise.resolve<CodexRefreshResult>({ accessToken: buildJwt({ exp: nowSec() + 3600 }), refreshToken: 'rt-new', idToken: null }),
        )
        const factory = buildFactory({ crypto, markReauthRequired, persistCodexCredentials, refreshCodexToken })
        const client = factory.create(codexRow(crypto, buildJwt({ exp: nowSec() + 60 })))
        const models = await client.listModels()
        expect(models.length).toBeGreaterThan(0)
        expect(markReauthRequired).toHaveBeenCalledTimes(1)
        expect(markReauthRequired.mock.calls[0][1]).toContain('persist failed')
    })

    test('access_token의 exp를 못 읽으면 만료로 간주해 refresh를 시도한다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const refreshCodexToken = mock(() =>
            Promise.resolve<CodexRefreshResult>({ accessToken: buildJwt({ exp: nowSec() + 3600 }), refreshToken: null, idToken: null }),
        )
        const factory = buildFactory({ crypto, refreshCodexToken })
        const client = factory.create(codexRow(crypto, buildJwt({ sub: 'no-exp' })))
        await client.listModels()
        expect(refreshCodexToken).toHaveBeenCalledTimes(1)
    })
})

describe('createAiProviderFactory.create (codex access token 단독)', () => {
    const tokenOnlyRow = (crypto: ReturnType<typeof createCredentialCrypto>, stored: StoredCodexCredentials) =>
        buildRow({ provider: 'codex', authType: 'token', credentials: crypto.encrypt(JSON.stringify(stored)) })

    test('refreshToken이 없으면 refresh 없이 저장된 accessToken을 그대로 쓴다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const refreshCodexToken = mock(() => Promise.resolve<CodexRefreshResult>({ accessToken: '', refreshToken: null, idToken: null }))
        const factory = buildFactory({ crypto, refreshCodexToken })
        const client = factory.create(tokenOnlyRow(crypto, { accessToken: buildJwt({ exp: nowSec() + 3600 }), accountId: 'acct-1' }))
        const models = await client.listModels()
        expect(models.length).toBeGreaterThan(0)
        expect(refreshCodexToken).not.toHaveBeenCalled()
    })

    test('accountId가 없으면 access_token JWT claim에서 파싱해 chatgpt-account-id 헤더에 쓴다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const fetchFn = mock(() => Promise.resolve(jsonOk({ models: [{ slug: 'gpt-5.1-codex' }] })))
        const factory = buildFactory({ crypto, fetchFn })
        const accessToken = buildJwt({ 'exp': nowSec() + 3600, 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-from-at' } })
        const client = factory.create(tokenOnlyRow(crypto, { accessToken }))
        await client.listModels()
        const headers = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
        expect(headers['chatgpt-account-id']).toBe('acct-from-at')
        expect(headers.authorization).toBe(`Bearer ${accessToken}`)
    })

    test('JWT가 아닌 opaque 토큰은 만료 선판정 없이 accountId와 함께 그대로 호출한다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const refreshCodexToken = mock(() => Promise.resolve<CodexRefreshResult>({ accessToken: '', refreshToken: null, idToken: null }))
        const factory = buildFactory({ crypto, refreshCodexToken })
        const client = factory.create(tokenOnlyRow(crypto, { accessToken: 'at-opaque-token', accountId: 'acct-1' }))
        const models = await client.listModels()
        expect(models.length).toBeGreaterThan(0)
        expect(refreshCodexToken).not.toHaveBeenCalled()
    })

    test('accessToken JWT가 만료면 refresh 대신 reauth_required로 마킹하고 AI_REAUTH_REQUIRED를 던진다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const refreshCodexToken = mock(() => Promise.resolve<CodexRefreshResult>({ accessToken: '', refreshToken: null, idToken: null }))
        const markReauthRequired = mock(async () => {})
        const factory = buildFactory({ crypto, refreshCodexToken, markReauthRequired })
        const row = tokenOnlyRow(crypto, { accessToken: buildJwt({ exp: nowSec() - 60 }), accountId: 'acct-1' })
        const client = factory.create(row)
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_REAUTH_REQUIRED' })
        expect(refreshCodexToken).not.toHaveBeenCalled()
        expect(markReauthRequired).toHaveBeenCalledTimes(1)
        expect(markReauthRequired.mock.calls[0][0]).toBe(row.id)
    })

    test('업스트림이 401을 반환하면 reauth_required로 마킹하고 AI_REAUTH_REQUIRED를 던진다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const markReauthRequired = mock(async () => {})
        const fetchFn = mock(() => Promise.resolve(httpErr(401)))
        const factory = buildFactory({ crypto, markReauthRequired, fetchFn })
        const row = tokenOnlyRow(crypto, { accessToken: buildJwt({ exp: nowSec() + 3600 }), accountId: 'acct-1' })
        await expect(factory.create(row).listModels()).rejects.toMatchObject({ code: 'AI_REAUTH_REQUIRED' })
        expect(markReauthRequired).toHaveBeenCalledTimes(1)
        expect(markReauthRequired.mock.calls[0][0]).toBe(row.id)
    })

    test('업스트림 401이 아닌 실패는 reauth로 바꾸지 않는다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const markReauthRequired = mock(async () => {})
        const fetchFn = mock(() => Promise.resolve(httpErr(500)))
        const factory = buildFactory({ crypto, markReauthRequired, fetchFn })
        const client = factory.create(tokenOnlyRow(crypto, { accessToken: buildJwt({ exp: nowSec() + 3600 }), accountId: 'acct-1' }))
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_MODEL_FETCH_FAILED' })
        expect(markReauthRequired).not.toHaveBeenCalled()
    })

    test('accountId도 없고 opaque 토큰이라 claim 파싱도 못 하면 AI_CREDENTIALS_INVALID를 던진다', async () => {
        const crypto = createCredentialCrypto(CRYPTO_KEY)
        const factory = buildFactory({ crypto })
        const client = factory.create(tokenOnlyRow(crypto, { accessToken: 'at-opaque-token' }))
        await expect(client.listModels()).rejects.toMatchObject({ code: 'AI_CREDENTIALS_INVALID' })
    })
})
