import type { SpotifyAccount } from '../../../db/schema'
import { createAppError } from '../../../lib/error'

type SpotifyAccountDb = {
    list: (userId: string) => Promise<SpotifyAccount[]>
    getById: (id: number) => Promise<SpotifyAccount | null>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    remove: (id: number) => Promise<void>
}

type SpotifyAccountServiceDeps = {
    db: SpotifyAccountDb
}

export const createSpotifyAccountService = (deps: SpotifyAccountServiceDeps) => {
    const assertOwnership = async (accountId: number, userId: string): Promise<SpotifyAccount> => {
        const account = await deps.db.getById(accountId)
        if (!account || account.userId !== userId) throw createAppError('SPOTIFY_ACCOUNT_NOT_FOUND')
        return account
    }

    const list = async (userId: string) => {
        return deps.db.list(userId)
    }

    const getById = async (accountId: number, userId: string) => {
        return assertOwnership(accountId, userId)
    }

    const update = async (accountId: number, userId: string, input: { displayName?: string; isActive?: boolean }) => {
        await assertOwnership(accountId, userId)
        const updateData: Record<string, unknown> = {}
        if (input.displayName !== undefined) updateData.displayName = input.displayName
        if (input.isActive !== undefined) updateData.isActive = input.isActive
        await deps.db.update(accountId, updateData)
    }

    const remove = async (accountId: number, userId: string) => {
        await assertOwnership(accountId, userId)
        await deps.db.remove(accountId)
    }

    return { list, getById, update, remove }
}

export type SpotifyAccountService = ReturnType<typeof createSpotifyAccountService>
