import { eq, and } from 'drizzle-orm'
import { apiToken } from '../../db/schema'
import type { Database } from '../../db/index'
import { generateToken, hashToken } from '../../lib/token-utils'

export { hashToken }

const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000

type ApiTokenDeps = {
    db: Database
}

export const createApiTokenService = (deps: ApiTokenDeps) => {
    const create = async (userId: string, name?: string, expiresInDays = 90) => {
        const token = generateToken()
        const tokenHash = hashToken(token)
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        await deps.db.insert(apiToken).values({
            userId,
            token: tokenHash,
            name: name ?? null,
            expiresAt,
        })
        return token
    }

    const validate = async (token: string) => {
        const tokenHash = hashToken(token)
        const results = await deps.db.select().from(apiToken).where(eq(apiToken.token, tokenHash)).limit(1)

        if (results.length === 0) return null

        const record = results[0]

        if (record.expiresAt && record.expiresAt < new Date()) return null

        const isLastUsedStale = !record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() >= LAST_USED_UPDATE_INTERVAL_MS
        if (isLastUsedStale) await deps.db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, record.id))

        return { id: record.userId }
    }

    const revoke = async (userId: string, token: string) => {
        const tokenHash = hashToken(token)
        await deps.db.delete(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.token, tokenHash)))
    }

    const revokeById = async (userId: string, id: number) => {
        await deps.db.delete(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.id, id)))
    }

    const listByUser = async (userId: string) => deps.db.select().from(apiToken).where(eq(apiToken.userId, userId))

    return { create, validate, revoke, revokeById, listByUser }
}

export type ApiTokenService = ReturnType<typeof createApiTokenService>
