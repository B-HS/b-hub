import { generateToken, hashToken } from '../../../lib/token-utils'
import { captureException } from '../../../lib/sentry'

type SpotifyApiKeyDb = {
    insert: (data: { userId: string; spotifyAccountId: number; token: string; name: string | null }) => Promise<{ id: number }>
    findByToken: (tokenHash: string) => Promise<{ id: number; userId: string; spotifyAccountId: number; expiresAt: Date | null } | null>
    updateLastUsedAt: (id: number) => Promise<void>
    remove: (userId: string, keyId: number) => Promise<void>
    listByUser: (userId: string) => Promise<
        {
            id: number
            spotifyAccountId: number
            name: string | null
            expiresAt: Date | null
            lastUsedAt: Date | null
            createdAt: Date
        }[]
    >
}

type SpotifyApiKeyServiceDeps = {
    db: SpotifyApiKeyDb
}

export const createSpotifyApiKeyService = (deps: SpotifyApiKeyServiceDeps) => {
    const create = async (userId: string, spotifyAccountId: number, name?: string) => {
        const token = generateToken()
        const tokenHash = hashToken(token)
        await deps.db.insert({
            userId,
            spotifyAccountId,
            token: tokenHash,
            name: name ?? null,
        })
        return token
    }

    const validate = async (token: string) => {
        const tokenHash = hashToken(token)
        const record = await deps.db.findByToken(tokenHash)
        if (!record) return null
        if (record.expiresAt && record.expiresAt < new Date()) return null

        deps.db.updateLastUsedAt(record.id).catch((e) => captureException(e))

        return { userId: record.userId, spotifyAccountId: record.spotifyAccountId }
    }

    const revoke = async (userId: string, keyId: number) => {
        await deps.db.remove(userId, keyId)
    }

    const listByUser = async (userId: string) => {
        return deps.db.listByUser(userId)
    }

    return { create, validate, revoke, listByUser }
}

export type SpotifyApiKeyService = ReturnType<typeof createSpotifyApiKeyService>
