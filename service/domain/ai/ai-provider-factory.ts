import type { AiProvider } from '../../../db/schema'
import type { CredentialCrypto } from '../../../lib/credential-crypto'
import type { AiProviderClient } from './ai-provider'
import { providerErrorMessage } from './ai-provider'
import { createAnthropicProvider } from './providers/anthropic-provider'
import { createOllamaProvider } from './providers/ollama-provider'
import { createCodexProvider } from './providers/codex-provider'
import { createAppError } from '../../../lib/error'
import { decodeJwtPayloadUnverified, getJwtExpiryMs } from '../../../lib/jwt-decode'

const CODEX_REFRESH_WINDOW_MS = 5 * 60 * 1000

export type StoredCodexCredentials = {
    idToken: string
    accessToken: string
    refreshToken: string
    accountId?: string
    lastRefresh?: string
}

export type StoredApiKeyCredentials = {
    apiKey: string
}

export const getCodexAccountId = (idToken: string): string | null => {
    const payload = decodeJwtPayloadUnverified(idToken)
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

    const refreshWithLock = (providerId: number | undefined, refreshToken: string) => {
        if (providerId == null) return deps.refreshCodexToken(refreshToken)
        const existing = refreshInFlight.get(providerId)
        if (existing) return existing
        const promise = deps.refreshCodexToken(refreshToken).finally(() => refreshInFlight.delete(providerId))
        refreshInFlight.set(providerId, promise)
        return promise
    }

    const buildCodexClient = (stored: StoredCodexCredentials, opts: BuildOpts): AiProviderClient => {
        if (!stored.accessToken || !stored.refreshToken) throw createAppError('AI_CREDENTIALS_INVALID')
        let current = stored

        const getAccessToken = async () => {
            const expiryMs = getJwtExpiryMs(current.accessToken)
            const needsRefresh = expiryMs === null || expiryMs - Date.now() < CODEX_REFRESH_WINDOW_MS
            if (needsRefresh) {
                let refreshed: CodexRefreshResult
                try {
                    refreshed = await refreshWithLock(opts.providerId, current.refreshToken)
                } catch (error) {
                    if (opts.onReauth) await opts.onReauth(providerErrorMessage(error)).catch(() => {})
                    throw createAppError('AI_REAUTH_REQUIRED')
                }
                current = {
                    ...current,
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken ?? current.refreshToken,
                    idToken: refreshed.idToken ?? current.idToken,
                    lastRefresh: new Date().toISOString(),
                }
                if (opts.onRefresh) {
                    try {
                        await opts.onRefresh(deps.crypto.encrypt(JSON.stringify(current)))
                    } catch (persistError) {
                        if (opts.onReauth)
                            await opts.onReauth(`token rotated but persist failed: ${providerErrorMessage(persistError)}`).catch(() => {})
                    }
                }
            }
            const accountId = current.accountId ?? getCodexAccountId(current.idToken) ?? ''
            if (!accountId) throw createAppError('AI_CREDENTIALS_INVALID')
            return { accessToken: current.accessToken, accountId }
        }

        return createCodexProvider({ getAccessToken, fetchFn: deps.fetchFn })
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

    return { create, createFromStored }
}

export type AiProviderFactory = ReturnType<typeof createAiProviderFactory>
