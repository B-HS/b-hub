import { generateToken, hashToken } from '../../../lib/token-utils'
import { captureException } from '../../../lib/sentry'
import type { MetricsToken } from '../../../db/schema'
import type { MetricsTokenCreateInput } from '../../../dto/metrics/token'

const DAY_MS = 24 * 60 * 60 * 1000

export type MetricsTokenServiceDb = {
    insertToken: (row: { token: string; alias: string; scope: string; dailyLimit?: number; expiresAt: Date | null }) => Promise<{ id: number }>
    findByToken: (tokenHash: string) => Promise<MetricsToken | null>
    touchLastUsed: (id: number) => Promise<void>
    revokeById: (id: number) => Promise<boolean>
    listAll: () => Promise<MetricsToken[]>
    countEventsSince: (tokenId: number, since: Date) => Promise<number>
}

type MetricsTokenServiceDeps = {
    db: MetricsTokenServiceDb
}

export const createMetricsTokenService = ({ db }: MetricsTokenServiceDeps) => {
    const create = async (input: MetricsTokenCreateInput) => {
        const token = generateToken()
        const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY_MS) : null
        const { id } = await db.insertToken({
            token: hashToken(token),
            alias: input.alias,
            scope: input.scope,
            dailyLimit: input.dailyLimit,
            expiresAt,
        })
        return { id, token }
    }

    const validate = async (token: string) => {
        const record = await db.findByToken(hashToken(token))
        if (!record) return null
        if (record.revokedAt) return null
        if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null

        db.touchLastUsed(record.id).catch((e) => captureException(e))

        return record
    }

    const checkRateLimit = async (tokenId: number, dailyLimit: number) => {
        const count = await db.countEventsSince(tokenId, new Date(Date.now() - DAY_MS))
        return count < dailyLimit
    }

    const revoke = async (id: number) => db.revokeById(id)

    const listAll = async () => db.listAll()

    return { create, validate, checkRateLimit, revoke, listAll }
}

export type MetricsTokenService = ReturnType<typeof createMetricsTokenService>
