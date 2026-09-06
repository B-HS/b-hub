import { and, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'
import { logEvents, mailSyncLogs, mailSyncSessions, weatherApiLog } from '../db/schema'
import { createLogEventService } from '../service/domain/logs/log-event'
import { createDeviceKeyService } from '../service/domain/logs/device-key'
import { sendDiscordAlert } from '../lib/discord'
import { captureException } from '../lib/sentry'
import type { LogAlerter, LogEventServiceDb } from '../service/domain/logs/log-event'
import type { ComposeLogsArgs } from './types'

const ALERT_THROTTLE_WINDOW_MS = 60_000
const ALERT_THROTTLE_MAX_KEYS = 500

export const composeLogs = ({ db, env }: ComposeLogsArgs) => {
    const logEventDb: LogEventServiceDb = {
        insertEvent: async (row) => {
            const [res] = await db.insert(logEvents).values(row).$returningId()
            return { id: res.id }
        },
        insertEvents: async (rows) => {
            if (rows.length === 0) return 0
            await db.insert(logEvents).values(rows)
            return rows.length
        },
        resolveById: async (id, resolvedAt) => {
            const [res] = await db.update(logEvents).set({ resolvedAt }).where(eq(logEvents.id, id))
            return res.affectedRows > 0
        },
        listEvents: async (filter) => {
            const conds = []
            if (filter.service) conds.push(eq(logEvents.service, filter.service))
            if (filter.severityGte != null) conds.push(gte(logEvents.severity, filter.severityGte))
            if (filter.category) conds.push(eq(logEvents.category, filter.category))
            if (filter.deviceId) conds.push(eq(logEvents.deviceId, filter.deviceId))
            if (filter.errorCode) conds.push(eq(logEvents.errorCode, filter.errorCode))
            if (filter.correlationId) conds.push(eq(logEvents.correlationId, filter.correlationId))
            if (filter.unresolved) conds.push(isNull(logEvents.resolvedAt))
            if (filter.from) conds.push(gte(logEvents.createdAt, filter.from))
            if (filter.to) conds.push(lte(logEvents.createdAt, filter.to))
            const where = conds.length ? and(...conds) : undefined
            const [{ total }] = await db
                .select({ total: sql<number>`count(*)` })
                .from(logEvents)
                .where(where)
            const rows = await db.select().from(logEvents).where(where).orderBy(desc(logEvents.createdAt)).limit(filter.limit).offset(filter.offset)
            return { rows, total: Number(total) }
        },
        getById: async (id) => {
            const [row] = await db.select().from(logEvents).where(eq(logEvents.id, id)).limit(1)
            return row ?? null
        },
        deleteOlderThan: async (before, maxSeverity, limit) => {
            const [res] = await db
                .delete(logEvents)
                .where(and(lte(logEvents.severity, maxSeverity), lt(logEvents.createdAt, before)))
                .limit(limit)
            return res.affectedRows
        },
        deleteWeatherApiLogsBefore: async (before, limit) => {
            const [res] = await db.delete(weatherApiLog).where(lt(weatherApiLog.createdAt, before)).limit(limit)
            return res.affectedRows
        },
        deleteMailSyncLogsBefore: async (before, limit) => {
            const [res] = await db.delete(mailSyncLogs).where(lt(mailSyncLogs.createdAt, before)).limit(limit)
            return res.affectedRows
        },
        deleteCompletedMailSyncSessionsBefore: async (before, limit) => {
            const [res] = await db
                .delete(mailSyncSessions)
                .where(and(isNotNull(mailSyncSessions.completedAt), lt(mailSyncSessions.completedAt, before)))
                .limit(limit)
            return res.affectedRows
        },
    }

    const alertThrottle = new Map<string, number>()
    const pruneThrottle = (now: number) => {
        for (const [key, at] of alertThrottle) {
            if (now - at >= ALERT_THROTTLE_WINDOW_MS) alertThrottle.delete(key)
        }
        while (alertThrottle.size > ALERT_THROTTLE_MAX_KEYS) {
            const oldest = alertThrottle.keys().next()
            if (oldest.done) break
            alertThrottle.delete(oldest.value)
        }
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL
    const alerter: LogAlerter | undefined = webhookUrl
        ? async (e) => {
              const key = `${e.service}:${e.errorCode}`
              const now = Date.now()
              if (now - (alertThrottle.get(key) ?? 0) < ALERT_THROTTLE_WINDOW_MS) return
              alertThrottle.delete(key)
              alertThrottle.set(key, now)
              pruneThrottle(now)
              try {
                  await sendDiscordAlert(webhookUrl, e)
              } catch (err) {
                  captureException(err)
              }
          }
        : undefined

    const logEventService = createLogEventService({ db: logEventDb, alerter })
    const deviceKeyService = createDeviceKeyService({ db })

    return { logEventService, deviceKeyService }
}
