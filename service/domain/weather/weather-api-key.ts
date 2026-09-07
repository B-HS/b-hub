import { eq, and, getTableColumns, gte, sql } from 'drizzle-orm'
import { weatherApiKey, weatherApiLog } from '../../../db/schema'
import { generateToken, hashToken } from '../../../lib/token-utils'
import type { Database } from '../../../db/index'
import { captureException } from '../../../lib/sentry'

const WEATHER_LOG_ENDPOINT_MAX_LENGTH = 50
const WEATHER_LOG_IP_MAX_LENGTH = 45
const WEATHER_LOG_USER_AGENT_MAX_LENGTH = 512
const WEATHER_LOG_ERROR_CODE_MAX_LENGTH = 50
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000
const RECENT_USAGE_HANDOFF_TTL_MS = 5 * 1000
const MAX_RECENT_USAGE_HANDOFFS = 100

type WeatherApiKeyDeps = {
    db: Database
}

const normalizeIp = (ip?: string) => {
    if (!ip) return null
    const first = ip.split(',')[0].trim()
    if (!first) return null
    return first.slice(0, WEATHER_LOG_IP_MAX_LENGTH)
}

export const createWeatherApiKeyService = (deps: WeatherApiKeyDeps) => {
    const recentUsageHandoffs = new Map<number, { count: number; expiresAtMs: number }>()

    const rememberRecentUsage = (keyId: number, value: unknown) => {
        const count = Number(value)
        if (!Number.isFinite(count)) return
        if (recentUsageHandoffs.size >= MAX_RECENT_USAGE_HANDOFFS) {
            const oldest = recentUsageHandoffs.keys().next().value
            if (oldest !== undefined) recentUsageHandoffs.delete(oldest)
        }
        recentUsageHandoffs.set(keyId, { count, expiresAtMs: Date.now() + RECENT_USAGE_HANDOFF_TTL_MS })
    }

    const takeRecentUsage = (keyId: number) => {
        const entry = recentUsageHandoffs.get(keyId)
        if (!entry) return null
        recentUsageHandoffs.delete(keyId)
        if (entry.expiresAtMs <= Date.now()) return null
        return entry.count
    }

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
        const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

        const recentUsageQuery = deps.db
            .select({ count: sql<number>`COUNT(*)` })
            .from(weatherApiLog)
            .where(and(eq(weatherApiLog.keyId, weatherApiKey.id), gte(weatherApiLog.createdAt, windowStart)))

        const results = await deps.db
            .select({ ...getTableColumns(weatherApiKey), recentUsage: sql<number>`(${recentUsageQuery})` })
            .from(weatherApiKey)
            .where(eq(weatherApiKey.token, tokenHash))
            .limit(1)

        if (results.length === 0) return null

        const { recentUsage, ...record } = results[0]

        if (record.expiresAt && record.expiresAt < new Date()) return null

        rememberRecentUsage(record.id, recentUsage)

        try {
            await deps.db.update(weatherApiKey).set({ lastUsedAt: new Date() }).where(eq(weatherApiKey.id, record.id))
        } catch (e) {
            captureException(e)
        }

        return record
    }

    const checkRateLimit = async (keyId: number, dailyLimit: number) => {
        const handedOff = takeRecentUsage(keyId)
        if (handedOff !== null) return handedOff < dailyLimit

        const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
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
                endpoint: data.endpoint.slice(0, WEATHER_LOG_ENDPOINT_MAX_LENGTH),
                nx: data.nx ?? null,
                ny: data.ny ?? null,
                statusCode: data.statusCode,
                ip: normalizeIp(data.ip),
                userAgent: data.userAgent?.slice(0, WEATHER_LOG_USER_AGENT_MAX_LENGTH) ?? null,
                durationMs: data.durationMs ?? null,
                errorCode: data.errorCode?.slice(0, WEATHER_LOG_ERROR_CODE_MAX_LENGTH) ?? null,
            })
            .catch((e) => captureException(e))
    }

    const revoke = async (userId: string, keyId: number) => {
        await deps.db.delete(weatherApiKey).where(and(eq(weatherApiKey.id, keyId), eq(weatherApiKey.userId, userId)))
    }

    const listByUser = async (userId: string) => {
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

        const usageSub = deps.db
            .select({
                keyId: weatherApiLog.keyId,
                count: sql<number>`COUNT(*)`.as('count'),
            })
            .from(weatherApiLog)
            .where(gte(weatherApiLog.createdAt, windowStart))
            .groupBy(weatherApiLog.keyId)
            .as('usage')

        const rows = await deps.db
            .select({
                id: weatherApiKey.id,
                name: weatherApiKey.name,
                dailyLimit: weatherApiKey.dailyLimit,
                todayUsage: sql<number>`COALESCE(${usageSub.count}, 0)`,
                expiresAt: weatherApiKey.expiresAt,
                lastUsedAt: weatherApiKey.lastUsedAt,
                createdAt: weatherApiKey.createdAt,
            })
            .from(weatherApiKey)
            .leftJoin(usageSub, eq(weatherApiKey.id, usageSub.keyId))
            .where(eq(weatherApiKey.userId, userId))

        return rows
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
