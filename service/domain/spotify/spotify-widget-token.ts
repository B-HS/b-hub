import { createAppError } from '../../../lib/error'
import { hashToken } from '../../../lib/token-utils'

type SpotifyWidgetTokenDb = {
    insert: (data: { userId: string; spotifyAccountId: number; token: string; name: string | null }) => Promise<{ id: number }>
    findByToken: (token: string) => Promise<{ id: number; userId: string; spotifyAccountId: number; isActive: boolean } | null>
    remove: (userId: string, tokenId: number) => Promise<void>
    listByUser: (userId: string) => Promise<
        {
            id: number
            spotifyAccountId: number
            name: string | null
            isActive: boolean
            createdAt: Date
        }[]
    >
    updateIsActive: (userId: string, tokenId: number, isActive: boolean) => Promise<void>
}

type SpotifyWidgetTokenServiceDeps = {
    db: SpotifyWidgetTokenDb
}

const generateWidgetToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export const createSpotifyWidgetTokenService = (deps: SpotifyWidgetTokenServiceDeps) => {
    const create = async (userId: string, spotifyAccountId: number, name?: string) => {
        const token = generateWidgetToken()
        const hashed = hashToken(token)
        await deps.db.insert({ userId, spotifyAccountId, token: hashed, name: name ?? null })
        return { token }
    }

    const validate = async (token: string) => {
        const hashed = hashToken(token)
        const record = await deps.db.findByToken(hashed)
        if (!record) throw createAppError('SPOTIFY_WIDGET_TOKEN_NOT_FOUND')
        if (!record.isActive) throw createAppError('SPOTIFY_WIDGET_TOKEN_INACTIVE')
        return { userId: record.userId, spotifyAccountId: record.spotifyAccountId }
    }

    const revoke = async (userId: string, tokenId: number) => {
        await deps.db.remove(userId, tokenId)
    }

    const listByUser = async (userId: string) => {
        return deps.db.listByUser(userId)
    }

    const toggleActive = async (userId: string, tokenId: number, isActive: boolean) => {
        await deps.db.updateIsActive(userId, tokenId, isActive)
    }

    return { create, validate, revoke, listByUser, toggleActive }
}

export type SpotifyWidgetTokenService = ReturnType<typeof createSpotifyWidgetTokenService>
