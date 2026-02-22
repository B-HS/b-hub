import { eq, and, gte, sql } from 'drizzle-orm'
import { weatherApiKey, weatherApiLog } from '../../../db/schema'
import { hashToken } from '../../shared/api-token'
import type { Database } from '../../../db/index'

type WeatherApiKeyDeps = {
    db: Database
}

const generateToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

export const createWeatherApiKeyService = (deps: WeatherApiKeyDeps) => {
    const create = async (userId: string, name?: string) => {
        const token = generateToken()
        const tokenHash = hashToken(token)
        await deps.db.insert(weatherApiKey).values({
            userId,
            token: tokenHash,
            name: name ?? null,
        })
        return token
    }

    const validate = async (token: string) => {
        const tokenHash = hashToken(token)
        const results = await deps.db.select().from(weatherApiKey).where(eq(weatherApiKey.token, tokenHash)).limit(1)

        if (results.length === 0) return null

        const record = results[0]

        if (record.expiresAt && record.expiresAt < new Date()) return null

        deps.db
            .update(weatherApiKey)
            .set({ lastUsedAt: new Date() })
            .where(eq(weatherApiKey.id, record.id))
            .catch(() => {})

        return record
    }

    const checkRateLimit = async (keyId: number, dailyLimit: number) => {
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const [result] = await deps.db
            .select({ count: sql<number>`COUNT(*)` })
            .from(weatherApiLog)
            .where(and(eq(weatherApiLog.keyId, keyId), gte(weatherApiLog.createdAt, windowStart)))

        return (result?.count ?? 0) < dailyLimit
    }

    const logRequest = async (data: {
        keyId: number
        userId: string
        endpoint: string
        nx?: number
        ny?: number
        statusCode: number
        ip?: string
        userAgent?: string
        durationMs?: number
        errorCode?: string
    }) => {
        await deps.db
            .insert(weatherApiLog)
            .values({
                keyId: data.keyId,
                userId: data.userId,
                endpoint: data.endpoint,
                nx: data.nx ?? null,
                ny: data.ny ?? null,
                statusCode: data.statusCode,
                ip: data.ip ?? null,
                userAgent: data.userAgent ?? null,
                durationMs: data.durationMs ?? null,
                errorCode: data.errorCode ?? null,
            })
            .catch(() => {})
    }

    const revoke = async (userId: string, keyId: number) => {
        await deps.db.delete(weatherApiKey).where(and(eq(weatherApiKey.id, keyId), eq(weatherApiKey.userId, userId)))
    }

    const listByUser = async (userId: string) => {
        const keys = await deps.db.select().from(weatherApiKey).where(eq(weatherApiKey.userId, userId))

        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const keysWithUsage = await Promise.all(
            keys.map(async (key) => {
                const [result] = await deps.db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(weatherApiLog)
                    .where(and(eq(weatherApiLog.keyId, key.id), gte(weatherApiLog.createdAt, windowStart)))

                return {
                    id: key.id,
                    name: key.name,
                    dailyLimit: key.dailyLimit,
                    todayUsage: result?.count ?? 0,
                    expiresAt: key.expiresAt,
                    lastUsedAt: key.lastUsedAt,
                    createdAt: key.createdAt,
                }
            }),
        )

        return keysWithUsage
    }

    const updateDailyLimit = async (keyId: number, limit: number) => {
        await deps.db.update(weatherApiKey).set({ dailyLimit: limit }).where(eq(weatherApiKey.id, keyId))
    }

    const getById = async (keyId: number) => {
        const [result] = await deps.db.select().from(weatherApiKey).where(eq(weatherApiKey.id, keyId)).limit(1)
        return result ?? null
    }

    return { create, validate, checkRateLimit, logRequest, revoke, listByUser, updateDailyLimit, getById }
}

export type WeatherApiKeyService = ReturnType<typeof createWeatherApiKeyService>
