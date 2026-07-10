import type { AiProvider } from '../../../db/schema'
import type { CredentialCrypto } from '../../../lib/credential-crypto'
import type { AiProviderFactory, StoredCodexCredentials, StoredApiKeyCredentials } from './ai-provider-factory'
import type { AiProviderClient } from './ai-provider'
import type { AiProviderCreate, AiProviderUpdate } from '../../../dto/ai/provider'
import { getCodexAccountId } from './ai-provider-factory'
import { createAppError } from '../../../lib/error'
import { maskProviderError } from '../../../lib/mail-utils'

export type AiConnectionInsert = {
    userId: string
    provider: string
    authType: string
    credentials: string
    displayName: string | null
    status: string
}

export type AiConnectionServiceDb = {
    getByUserAndProvider: (userId: string, provider: string) => Promise<AiProvider | null>
    getById: (id: number) => Promise<AiProvider | null>
    listByUser: (userId: string) => Promise<AiProvider[]>
    insert: (data: AiConnectionInsert) => Promise<{ id: number }>
    updateCredentials: (id: number, encryptedCredentials: string, authType: string) => Promise<void>
    updateStatus: (id: number, status: string, statusDetail: string | null) => Promise<void>
    updateDisplayName: (id: number, displayName: string | null) => Promise<void>
    touchUsed: (id: number) => Promise<void>
    touchModelsFetched: (id: number) => Promise<void>
    remove: (id: number) => Promise<void>
}

type AiConnectionDeps = {
    db: AiConnectionServiceDb
    crypto: CredentialCrypto
    factory: AiProviderFactory
}

type BuiltCredentials = { stored: StoredCodexCredentials | StoredApiKeyCredentials; authType: string }

const buildStored = async (input: AiProviderCreate, factory: AiProviderFactory): Promise<BuiltCredentials> => {
    if (input.provider === 'codex') {
        if (!('refreshToken' in input.credentials)) {
            const accountId = await factory.resolveCodexAccountId(input.credentials.accessToken, input.credentials.accountId)
            if (!accountId)
                throw createAppError('AI_CREDENTIALS_INVALID', { detail: 'accountId not resolvable from access_token, provide accountId' })
            return { stored: { accessToken: input.credentials.accessToken, accountId }, authType: 'token' }
        }
        const accountId = input.credentials.accountId ?? getCodexAccountId(input.credentials.idToken) ?? undefined
        if (!accountId) throw createAppError('AI_CREDENTIALS_INVALID', { detail: 'accountId not resolvable from id_token' })
        return {
            stored: {
                idToken: input.credentials.idToken,
                accessToken: input.credentials.accessToken,
                refreshToken: input.credentials.refreshToken,
                accountId,
                lastRefresh: input.credentials.lastRefresh ?? new Date().toISOString(),
            },
            authType: 'oauth',
        }
    }
    return { stored: { apiKey: input.credentials.apiKey }, authType: 'apikey' }
}

export const createAiConnectionService = ({ db, crypto, factory }: AiConnectionDeps) => {
    const list = async (userId: string) => db.listByUser(userId)

    const getOwned = async (userId: string, id: number) => {
        const row = await db.getById(id)
        if (!row || row.userId !== userId) throw createAppError('AI_PROVIDER_NOT_FOUND')
        return row
    }

    const connect = async (userId: string, input: AiProviderCreate) => {
        const { stored, authType } = await buildStored(input, factory)
        const encrypted = crypto.encrypt(JSON.stringify(stored))

        const client = factory.createFromStored(input.provider, stored)
        const verified = await client.verify()
        if (!verified.ok)
            throw createAppError('AI_CREDENTIALS_INVALID', { detail: maskProviderError(verified.error ?? 'verification failed').slice(0, 200) })

        const existing = await db.getByUserAndProvider(userId, input.provider)
        if (existing) {
            await db.updateCredentials(existing.id, encrypted, authType)
            await db.updateStatus(existing.id, 'active', null)
            if (input.displayName !== undefined) await db.updateDisplayName(existing.id, input.displayName ?? null)
            return getOwned(userId, existing.id)
        }

        const { id } = await db.insert({
            userId,
            provider: input.provider,
            authType,
            credentials: encrypted,
            displayName: input.displayName ?? null,
            status: 'active',
        })
        return getOwned(userId, id)
    }

    const update = async (userId: string, id: number, input: AiProviderUpdate) => {
        await getOwned(userId, id)
        if (input.displayName !== undefined) await db.updateDisplayName(id, input.displayName ?? null)
        if (input.status !== undefined) await db.updateStatus(id, input.status, null)
        return getOwned(userId, id)
    }

    const remove = async (userId: string, id: number) => {
        await getOwned(userId, id)
        await db.remove(id)
    }

    const resolveClient = async (userId: string, provider: string): Promise<{ row: AiProvider; client: AiProviderClient }> => {
        const row = await db.getByUserAndProvider(userId, provider)
        if (!row || row.status === 'disabled') throw createAppError('AI_PROVIDER_NOT_FOUND')
        if (row.status === 'reauth_required') throw createAppError('AI_REAUTH_REQUIRED')
        return { row, client: factory.create(row) }
    }

    return { list, getOwned, connect, update, remove, resolveClient, touchUsed: db.touchUsed, touchModelsFetched: db.touchModelsFetched }
}

export type AiConnectionService = ReturnType<typeof createAiConnectionService>
