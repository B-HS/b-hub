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
