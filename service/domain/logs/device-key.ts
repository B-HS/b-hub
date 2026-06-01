import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { deviceKey, logEvents } from '../../../db/schema'
import { generateToken, hashToken } from '../../../lib/token-utils'
import { captureException } from '../../../lib/sentry'
import type { Database } from '../../../db/index'

type DeviceKeyDeps = {
    db: Database
}

export const createDeviceKeyService = (deps: DeviceKeyDeps) => {
    const create = async (deviceId?: string, label?: string) => {
        const token = generateToken()
        const tokenHash = hashToken(token)
        await deps.db.insert(deviceKey).values({
            token: tokenHash,
            deviceId: deviceId ?? null,
            label: label ?? null,
        })
        return token
    }

    const validate = async (token: string) => {
        const tokenHash = hashToken(token)
        const [record] = await deps.db.select().from(deviceKey).where(eq(deviceKey.token, tokenHash)).limit(1)

        if (!record) return null
        if (record.revokedAt) return null

        deps.db
            .update(deviceKey)
            .set({ lastUsedAt: new Date() })
            .where(eq(deviceKey.id, record.id))
            .catch((e) => captureException(e))

        return record
    }

    const checkRateLimit = async (deviceId: string | null, dailyLimit: number) => {
        if (!deviceId) return true
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const [result] = await deps.db
            .select({ count: sql<number>`COUNT(*)` })
            .from(logEvents)
            .where(and(eq(logEvents.deviceId, deviceId), gte(logEvents.createdAt, windowStart)))

        return (result?.count ?? 0) < dailyLimit
    }

    const revoke = async (id: number) => {
        await deps.db.update(deviceKey).set({ revokedAt: new Date() }).where(eq(deviceKey.id, id))
    }

    const listAll = async () => deps.db.select().from(deviceKey).orderBy(desc(deviceKey.createdAt))

    return { create, validate, checkRateLimit, revoke, listAll }
}

export type DeviceKeyService = ReturnType<typeof createDeviceKeyService>
