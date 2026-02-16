import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { apiToken } from '../../db/schema'
import type { Database } from '../../db/index'

type ApiTokenDeps = {
    db: Database
}

const generateToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

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

        await deps.db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, record.id))

        return { id: record.userId }
    }

    const revoke = async (userId: string, token: string) => {
        const tokenHash = hashToken(token)
        await deps.db.delete(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.token, tokenHash)))
    }

    const listByUser = async (userId: string) => deps.db.select().from(apiToken).where(eq(apiToken.userId, userId))

    return { create, validate, revoke, listByUser }
}

export type ApiTokenService = ReturnType<typeof createApiTokenService>
