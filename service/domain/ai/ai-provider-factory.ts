import type { AiProvider } from '../../../db/schema'
import type { CredentialCrypto } from '../../../lib/credential-crypto'
import type { AiProviderClient } from './ai-provider'
import { providerErrorMessage } from './ai-provider'
import { createAnthropicProvider } from './providers/anthropic-provider'
import { createOllamaProvider } from './providers/ollama-provider'
import { createCodexProvider, fetchCodexAccountId, CODEX_ACCESS_TOKEN_PREFIX } from './providers/codex-provider'
import { createAppError, isAppError } from '../../../lib/error'
import { decodeJwtPayloadUnverified, getJwtExpiryMs } from '../../../lib/jwt-decode'

const CODEX_REFRESH_WINDOW_MS = 5 * 60 * 1000

export type StoredCodexCredentials = {
    idToken?: string
    accessToken: string
    refreshToken?: string
    accountId?: string
    lastRefresh?: string
}

export type StoredApiKeyCredentials = {
    apiKey: string
}

export const getCodexAccountId = (token: string): string | null => {
    const payload = decodeJwtPayloadUnverified(token)
    const auth = payload?.['https://api.openai.com/auth']
    if (typeof auth !== 'object' || auth === null) return null
    const accountId = (auth as Record<string, unknown>).chatgpt_account_id
    return typeof accountId === 'string' ? accountId : null
}

export type CodexRefreshResult = {
    accessToken: string
    refreshToken: string | null
    idToken: string | null
}

type BuildOpts = {
    providerId?: number
    onRefresh?: (encryptedCredentials: string) => Promise<void>
    onReauth?: (detail: string) => Promise<void>
}

type AiProviderFactoryDeps = {
    crypto: CredentialCrypto
    refreshCodexToken: (refreshToken: string) => Promise<CodexRefreshResult>
    persistCodexCredentials: (providerId: number, encryptedCredentials: string) => Promise<void>
    markReauthRequired: (providerId: number, detail: string) => Promise<void>
    fetchFn?: typeof fetch
}

export const createAiProviderFactory = (deps: AiProviderFactoryDeps) => {
    const refreshInFlight = new Map<number, Promise<CodexRefreshResult>>()

    const refreshWithLock = (providerId: number | undefined, refreshToken: string, persist: (refreshed: CodexRefreshResult) => Promise<void>) => {
        const run = async () => {
            const refreshed = await deps.refreshCodexToken(refreshToken)
            await persist(refreshed)
            return refreshed
        }
        if (providerId == null) return run()
        const existing = refreshInFlight.get(providerId)
        if (existing) return existing
        const promise = run().finally(() => refreshInFlight.delete(providerId))
        refreshInFlight.set(providerId, promise)
        return promise
    }

    const buildCodexClient = (stored: StoredCodexCredentials, opts: BuildOpts): AiProviderClient => {
        if (!stored.accessToken) throw createAppError('AI_CREDENTIALS_INVALID')
        let current = stored

        const markReauth = async (detail: string) => {
            if (opts.onReauth) await opts.onReauth(detail).catch(() => {})
            return createAppError('AI_REAUTH_REQUIRED')
        }

        const rotate = (refreshed: CodexRefreshResult, refreshToken: string): StoredCodexCredentials => ({
            ...current,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? refreshToken,
            idToken: refreshed.idToken ?? current.idToken,
            lastRefresh: new Date().toISOString(),
        })

        const persistRotated = async (refreshed: CodexRefreshResult, refreshToken: string) => {
            if (!opts.onRefresh) return
            try {
                await opts.onRefresh(deps.crypto.encrypt(JSON.stringify(rotate(refreshed, refreshToken))))
            } catch (persistError) {
                if (opts.onReauth) await opts.onReauth(`token rotated but persist failed: ${providerErrorMessage(persistError)}`).catch(() => {})
            }
        }

        const getAccessToken = async () => {
            const expiryMs = getJwtExpiryMs(current.accessToken)
            const refreshToken = current.refreshToken
            if (refreshToken) {
                const needsRefresh = expiryMs === null || expiryMs - Date.now() < CODEX_REFRESH_WINDOW_MS
                if (needsRefresh) {
                    let refreshed: CodexRefreshResult
                    try {
                        refreshed = await refreshWithLock(opts.providerId, refreshToken, (fresh) => persistRotated(fresh, refreshToken))
                    } catch (error) {
                        throw await markReauth(providerErrorMessage(error))
                    }
                    current = rotate(refreshed, refreshToken)
                }
            } else if (expiryMs !== null && expiryMs <= Date.now()) {
                throw await markReauth('access token expired and no refresh token stored, re-register required')
            }
            const accountId =
                current.accountId ?? (current.idToken ? getCodexAccountId(current.idToken) : null) ?? getCodexAccountId(current.accessToken) ?? ''
            if (!accountId) throw createAppError('AI_CREDENTIALS_INVALID')
            return { accessToken: current.accessToken, accountId }
        }

        const client = createCodexProvider({ getAccessToken, fetchFn: deps.fetchFn })
        if (stored.refreshToken) return client

        const withReauthOn401 =
            <Args extends unknown[], Result>(call: (...args: Args) => Promise<Result>) =>
            async (...args: Args) => {
                try {
                    return await call(...args)
                } catch (error) {
                    if (isAppError(error) && error.details?.status === 401)
                        throw await markReauth('provider rejected access token with 401, re-register required')
                    throw error
                }
            }

        return {
            listModels: withReauthOn401(client.listModels),
            complete: withReauthOn401(client.complete),
            completeStream: withReauthOn401(client.completeStream),
            verify: client.verify,
        }
    }

    const buildClient = (provider: string, stored: StoredCodexCredentials | StoredApiKeyCredentials, opts: BuildOpts): AiProviderClient => {
        if (provider === 'anthropic' || provider === 'ollama') {
            const apiKey = (stored as StoredApiKeyCredentials).apiKey
            if (!apiKey) throw createAppError('AI_CREDENTIALS_INVALID')
            return provider === 'anthropic'
                ? createAnthropicProvider({ apiKey, fetchFn: deps.fetchFn })
                : createOllamaProvider({ apiKey, fetchFn: deps.fetchFn })
        }
        if (provider === 'codex') return buildCodexClient(stored as StoredCodexCredentials, opts)
        throw createAppError('AI_CREDENTIALS_INVALID')
    }

    const decode = (row: AiProvider) => {
        try {
            return JSON.parse(deps.crypto.decrypt(row.credentials)) as StoredCodexCredentials | StoredApiKeyCredentials
        } catch {
            throw createAppError('AI_CREDENTIALS_INVALID')
        }
    }

    const create = (row: AiProvider): AiProviderClient =>
        buildClient(row.provider, decode(row), {
            providerId: row.id,
            onRefresh: (encrypted) => deps.persistCodexCredentials(row.id, encrypted),
            onReauth: (detail) => deps.markReauthRequired(row.id, detail),
        })

    const createFromStored = (provider: string, stored: StoredCodexCredentials | StoredApiKeyCredentials): AiProviderClient =>
        buildClient(provider, stored, {})

    const resolveCodexAccountId = async (accessToken: string, providedAccountId?: string): Promise<string | null> => {
        if (providedAccountId) return providedAccountId
        const claim = getCodexAccountId(accessToken)
        if (claim) return claim
        if (accessToken.startsWith(CODEX_ACCESS_TOKEN_PREFIX)) return fetchCodexAccountId(accessToken, deps.fetchFn ?? fetch)
        return null
    }

    return { create, createFromStored, resolveCodexAccountId }
}

export type AiProviderFactory = ReturnType<typeof createAiProviderFactory>
