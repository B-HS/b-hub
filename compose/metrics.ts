import { desc, eq } from 'drizzle-orm'
import { metricsToken } from '../db/schema'
import { getMongo } from '../db/mongo'
import { createMetricsTokenService } from '../service/domain/metrics/token'
import { createMetricsLogService } from '../service/domain/metrics/log'
import { sendDiscordAlert } from '../lib/discord'
import { captureException } from '../lib/sentry'
import type { Filter } from 'mongodb'
import type { MetricsLogDoc } from '../db/mongo'
import type { MetricsTokenServiceDb } from '../service/domain/metrics/token'
import type { MetricsAlerter, MetricsLogServiceDb } from '../service/domain/metrics/log'
import type { ComposeMetricsArgs } from './types'

export const composeMetrics = ({ db, env }: ComposeMetricsArgs) => {
    if (!env.MONGODB_URI) return {}

    const mongo = getMongo(env.MONGODB_URI)

    const tokenDb: MetricsTokenServiceDb = {
        insertToken: async (row) => {
            const [res] = await db.insert(metricsToken).values(row).$returningId()
            return { id: res.id }
        },
        findByToken: async (tokenHash) => {
            const [record] = await db.select().from(metricsToken).where(eq(metricsToken.token, tokenHash)).limit(1)
            return record ?? null
        },
        touchLastUsed: async (id) => {
            await db.update(metricsToken).set({ lastUsedAt: new Date() }).where(eq(metricsToken.id, id))
        },
        revokeById: async (id) => {
            const [res] = await db.update(metricsToken).set({ revokedAt: new Date() }).where(eq(metricsToken.id, id))
            return res.affectedRows > 0
        },
        listAll: async () => db.select().from(metricsToken).orderBy(desc(metricsToken.createdAt)),
        countEventsSince: async (tokenId, since) => mongo.logs.countDocuments({ tokenId, receivedAt: { $gte: since } }),
    }

    const logDb: MetricsLogServiceDb = {
        insertLogs: async (rows) => {
            if (rows.length === 0) return 0
            const res = await mongo.logs.insertMany(rows)
            return res.insertedCount
        },
        upsertDevice: async (row) => {
            const { seenAt, deviceId, tokenId, tokenAlias, ...meta } = row
            const set: Record<string, unknown> = { tokenId, tokenAlias, lastSeenAt: seenAt }
            const setOnInsert: Record<string, unknown> = { deviceId, firstSeenAt: seenAt, downAlertedAt: null }
            for (const [key, value] of Object.entries(meta)) {
                if (value === null) setOnInsert[key] = null
                else set[key] = value
            }
            await mongo.devices.updateOne({ deviceId }, { $set: set, $setOnInsert: setOnInsert }, { upsert: true })
        },
        listLogs: async (filter) => {
            const query: Filter<MetricsLogDoc> = {}
            if (filter.deviceId) query.deviceId = filter.deviceId
            if (filter.tokenId) query.tokenId = filter.tokenId
            if (filter.from || filter.to)
                query.receivedAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) }
            const total = await mongo.logs.countDocuments(query)
            const rows = await mongo.logs
                .find(query, { projection: { _id: 0 } })
                .sort({ receivedAt: -1 })
                .skip(filter.offset)
                .limit(filter.limit)
                .toArray()
            return { rows, total }
        },
        listDevices: async () =>
            mongo.devices
                .find({}, { projection: { _id: 0 } })
                .sort({ lastSeenAt: -1 })
                .toArray(),
        getDevice: async (deviceId) => {
            const device = await mongo.devices.findOne({ deviceId }, { projection: { _id: 0 } })
            return device ?? null
        },
        seriesPoints: async (params) => {
            const match: Record<string, unknown> = { deviceId: params.deviceId, [`payload.${params.field}`]: { $type: 'number' } }
            if (params.from || params.to)
                match.receivedAt = { ...(params.from ? { $gte: params.from } : {}), ...(params.to ? { $lte: params.to } : {}) }
            const points = await mongo.logs
                .aggregate<{
                    t: Date
                    v: number
                }>([
                    { $match: match },
                    { $sort: { receivedAt: -1 } },
                    { $limit: params.limit },
                    { $project: { _id: 0, t: '$receivedAt', v: `$payload.${params.field}` } },
                ])
                .toArray()
            return points.reverse()
        },
        setDeviceAlerted: async (deviceId, at) => {
            await mongo.devices.updateOne({ deviceId }, { $set: { downAlertedAt: at } })
        },
    }

    const alertThrottle = new Map<string, number>()
    const alerter: MetricsAlerter | undefined = env.DISCORD_WEBHOOK_URL
        ? (e) => {
              const key = `${e.errorCode}:${e.deviceId ?? ''}`
              const now = Date.now()
              if (now - (alertThrottle.get(key) ?? 0) < 60_000) return
              alertThrottle.set(key, now)
              sendDiscordAlert(env.DISCORD_WEBHOOK_URL!, e).catch((err) => captureException(err))
          }
        : undefined

    const metricsTokenService = createMetricsTokenService({ db: tokenDb })
    const metricsLogService = createMetricsLogService({ db: logDb, alerter })

    return { metricsTokenService, metricsLogService }
}
