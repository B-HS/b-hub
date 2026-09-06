import { SEVERITY } from '../../../dto/logs/log-event'
import { captureException } from '../../../lib/sentry'
import type { LogEventIngest } from '../../../dto/logs/log-event'
import type { LogEvent } from '../../../db/schema'

const DAY_MS = 24 * 60 * 60 * 1000
const INFO_RETENTION_DAYS = 7
const WARN_RETENTION_DAYS = 30
const ERROR_RETENTION_DAYS = 180
const REQUEST_LOG_RETENTION_DAYS = 90
const COMPLETED_SESSION_RETENTION_DAYS = 30
const MAX_SEVERITY_BOUND = 1000
const PURGE_BATCH_SIZE = 1000
const PURGE_MAX_ROUNDS = 50

export type NewLogEventInput = {
    service: string
    errorCode: string
    errorDescription?: string | null
    severity: number
    category?: string | null
    deviceId?: string | null
    firmwareVersion?: string | null
    source?: string | null
    correlationId?: string | null
    sessionId?: string | null
    retryCount?: number | null
    occurredAt?: Date | null
    details?: Record<string, unknown> | null
    ingestIp?: string | null
}

export type LogEventFilter = {
    service?: string
    severityGte?: number
    category?: string
    deviceId?: string
    errorCode?: string
    correlationId?: string
    unresolved?: boolean
    from?: Date
    to?: Date
    limit: number
    offset: number
}

export type LogEventServiceDb = {
    insertEvent: (row: NewLogEventInput) => Promise<{ id: number }>
    insertEvents: (rows: NewLogEventInput[]) => Promise<number>
    resolveById: (id: number, resolvedAt: Date) => Promise<boolean>
    listEvents: (filter: LogEventFilter) => Promise<{ rows: LogEvent[]; total: number }>
    getById: (id: number) => Promise<LogEvent | null>
    deleteOlderThan: (before: Date, maxSeverity: number, limit: number) => Promise<number>
    deleteWeatherApiLogsBefore: (before: Date, limit: number) => Promise<number>
    deleteMailSyncLogsBefore: (before: Date, limit: number) => Promise<number>
    deleteCompletedMailSyncSessionsBefore: (before: Date, limit: number) => Promise<number>
}

export type LogAlerter = (event: {
    service: string
    errorCode: string
    severity: number
    errorDescription?: string | null
    deviceId?: string | null
}) => Promise<void> | void

type LogEventServiceDeps = {
    db: LogEventServiceDb
    alerter?: LogAlerter
}

export const createLogEventService = ({ db, alerter }: LogEventServiceDeps) => {
    const toRow = (input: LogEventIngest, meta: { ingestIp?: string; source?: string }) => ({
        service: input.service,
        errorCode: input.errorCode,
        errorDescription: input.errorDescription ?? null,
        severity: input.severity,
        category: input.category ?? null,
        deviceId: input.deviceId ?? null,
        firmwareVersion: input.firmwareVersion ?? null,
        source: input.source ?? meta.source ?? null,
        correlationId: input.correlationId ?? null,
        sessionId: input.sessionId ?? null,
        retryCount: input.retryCount ?? null,
        occurredAt: input.occurredAt ?? null,
        details: input.details ?? null,
        ingestIp: meta.ingestIp ?? null,
    })

    const maybeAlert = async (row: NewLogEventInput) => {
        if (!alerter || row.severity < SEVERITY.ERROR) return
        try {
            await alerter({
                service: row.service,
                errorCode: row.errorCode,
                severity: row.severity,
                errorDescription: row.errorDescription,
                deviceId: row.deviceId,
            })
        } catch (error) {
            captureException(error)
        }
    }

    const ingest = async (input: LogEventIngest, meta: { ingestIp?: string; source?: string }) => {
        const row = toRow(input, meta)
        const res = await db.insertEvent(row)
        void maybeAlert(row)
        return res
    }

    const ingestBatch = async (events: LogEventIngest[], meta: { ingestIp?: string; source?: string }) => {
        const rows = events.map((e) => toRow(e, meta))
        const count = await db.insertEvents(rows)
        rows.forEach((row) => void maybeAlert(row))
        return count
    }

    const resolve = async (id: number, resolvedAt?: Date) => db.resolveById(id, resolvedAt ?? new Date())

    const list = async (filter: LogEventFilter) => db.listEvents(filter)

    const captureServerError = async (e: {
        service: string
        errorCode: string
        severity: number
        errorDescription?: string
        category?: string
        details?: Record<string, unknown>
        correlationId?: string
        ingestIp?: string
        source?: string
    }) => {
        const row = {
            service: e.service,
            errorCode: e.errorCode,
            errorDescription: e.errorDescription ?? null,
            severity: e.severity,
            category: e.category ?? null,
            source: e.source ?? 'server',
            correlationId: e.correlationId ?? null,
            details: e.details ?? null,
            ingestIp: e.ingestIp ?? null,
            occurredAt: null,
        }
        await db.insertEvent(row)
        void maybeAlert(row)
    }

    const deleteInBatches = async (deleteBatch: (limit: number) => Promise<number>) => {
        let total = 0
        for (let round = 0; round < PURGE_MAX_ROUNDS; round++) {
            const deleted = await deleteBatch(PURGE_BATCH_SIZE)
            total += deleted
            if (deleted < PURGE_BATCH_SIZE) break
        }
        return total
    }

    const purgeByPolicy = async () => {
        const now = Date.now()
        const infoDeleted = await deleteInBatches((limit) =>
            db.deleteOlderThan(new Date(now - INFO_RETENTION_DAYS * DAY_MS), SEVERITY.WARN - 1, limit),
        )
        const warnDeleted = await deleteInBatches((limit) =>
            db.deleteOlderThan(new Date(now - WARN_RETENTION_DAYS * DAY_MS), SEVERITY.ERROR - 1, limit),
        )
        const errorDeleted = await deleteInBatches((limit) =>
            db.deleteOlderThan(new Date(now - ERROR_RETENTION_DAYS * DAY_MS), MAX_SEVERITY_BOUND, limit),
        )
        return { infoDeleted, warnDeleted, errorDeleted }
    }

    const purgeRetention = async () => {
        const now = Date.now()
        const weatherApiLogDeleted = await deleteInBatches((limit) =>
            db.deleteWeatherApiLogsBefore(new Date(now - REQUEST_LOG_RETENTION_DAYS * DAY_MS), limit),
        )
        const mailSyncLogDeleted = await deleteInBatches((limit) =>
            db.deleteMailSyncLogsBefore(new Date(now - REQUEST_LOG_RETENTION_DAYS * DAY_MS), limit),
        )
        const mailSyncSessionDeleted = await deleteInBatches((limit) =>
            db.deleteCompletedMailSyncSessionsBefore(new Date(now - COMPLETED_SESSION_RETENTION_DAYS * DAY_MS), limit),
        )
        return { weatherApiLogDeleted, mailSyncLogDeleted, mailSyncSessionDeleted }
    }

    return { ingest, ingestBatch, resolve, list, getById: db.getById, captureServerError, purgeByPolicy, purgeRetention }
}

export type LogEventService = ReturnType<typeof createLogEventService>
