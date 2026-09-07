import { desc, gte } from 'drizzle-orm'
import { getDb } from '../../db/index'
import { logEvents, mailAccounts, mailSyncLogs, weatherApiLog } from '../../db/schema'

const RECENT_HOURS = 6
const HOUR_MS = 60 * 60 * 1000
const ERROR_SEVERITY = 40
const SYNC_LOG_LIMIT = 10
const LOG_EVENT_LIMIT = 20
const WEATHER_LOG_LIMIT = 15
const TEXT_LIMIT = 400

const db = getDb()
const since = new Date(Date.now() - RECENT_HOURS * HOUR_MS)

const accounts = await db
    .select({
        id: mailAccounts.id,
        provider: mailAccounts.provider,
        isActive: mailAccounts.isActive,
        lastSyncAt: mailAccounts.lastSyncAt,
        lastSyncStatus: mailAccounts.lastSyncStatus,
    })
    .from(mailAccounts)

const syncLogs = await db
    .select({
        id: mailSyncLogs.id,
        accountId: mailSyncLogs.accountId,
        syncType: mailSyncLogs.syncType,
        status: mailSyncLogs.status,
        folderId: mailSyncLogs.folderId,
        added: mailSyncLogs.messagesAdded,
        updated: mailSyncLogs.messagesUpdated,
        deleted: mailSyncLogs.messagesDeleted,
        durationMs: mailSyncLogs.durationMs,
        errorMessage: mailSyncLogs.errorMessage,
        startedAt: mailSyncLogs.startedAt,
        completedAt: mailSyncLogs.completedAt,
    })
    .from(mailSyncLogs)
    .orderBy(desc(mailSyncLogs.id))
    .limit(SYNC_LOG_LIMIT)

const errorEvents = await db
    .select({
        id: logEvents.id,
        service: logEvents.service,
        errorCode: logEvents.errorCode,
        errorDescription: logEvents.errorDescription,
        category: logEvents.category,
        source: logEvents.source,
        details: logEvents.details,
        createdAt: logEvents.createdAt,
    })
    .from(logEvents)
    .where(gte(logEvents.createdAt, since))
    .orderBy(desc(logEvents.id))
    .limit(LOG_EVENT_LIMIT)

const weatherLogs = await db
    .select({
        keyId: weatherApiLog.keyId,
        endpoint: weatherApiLog.endpoint,
        nx: weatherApiLog.nx,
        ny: weatherApiLog.ny,
        statusCode: weatherApiLog.statusCode,
        errorCode: weatherApiLog.errorCode,
        durationMs: weatherApiLog.durationMs,
        createdAt: weatherApiLog.createdAt,
    })
    .from(weatherApiLog)
    .orderBy(desc(weatherApiLog.id))
    .limit(WEATHER_LOG_LIMIT)

const truncate = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text && text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text
}

console.log(
    JSON.stringify(
        {
            accounts,
            syncLogs: syncLogs.map((row) => ({ ...row, errorMessage: truncate(row.errorMessage) })),
            errorEvents: errorEvents
                .filter((row) => row.errorCode)
                .map((row) => ({ ...row, errorDescription: truncate(row.errorDescription), details: truncate(row.details) })),
            weatherLogs,
            errorSeverityThreshold: ERROR_SEVERITY,
        },
        null,
        2,
    ),
)

process.exit(0)
