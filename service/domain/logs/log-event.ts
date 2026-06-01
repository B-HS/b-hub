import { SEVERITY } from '../../../dto/logs/log-event'
import type { LogEventIngest } from '../../../dto/logs/log-event'
import type { LogEvent } from '../../../db/schema'

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
    deleteOlderThan: (before: Date, maxSeverity: number) => Promise<number>
}

export type LogAlerter = (event: { service: string; errorCode: string; severity: number; errorDescription?: string | null; deviceId?: string | null }) => void

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

    const maybeAlert = (row: NewLogEventInput) => {
        if (alerter && row.severity >= SEVERITY.ERROR) {
            alerter({ service: row.service, errorCode: row.errorCode, severity: row.severity, errorDescription: row.errorDescription, deviceId: row.deviceId })
        }
    }

    const ingest = async (input: LogEventIngest, meta: { ingestIp?: string; source?: string }) => {
        const row = toRow(input, meta)
        const res = await db.insertEvent(row)
        maybeAlert(row)
        return res
    }

    const ingestBatch = async (events: LogEventIngest[], meta: { ingestIp?: string; source?: string }) => {
        const rows = events.map((e) => toRow(e, meta))
        const count = await db.insertEvents(rows)
        rows.forEach(maybeAlert)
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
        maybeAlert(row)
    }

    const purgeByPolicy = async () => {
        const now = Date.now()
        const day = 24 * 60 * 60 * 1000
        const infoDeleted = await db.deleteOlderThan(new Date(now - 7 * day), SEVERITY.WARN - 1)
        const warnDeleted = await db.deleteOlderThan(new Date(now - 30 * day), SEVERITY.ERROR - 1)
        const errorDeleted = await db.deleteOlderThan(new Date(now - 180 * day), 1000)
        return { infoDeleted, warnDeleted, errorDeleted }
    }

    return { ingest, ingestBatch, resolve, list, getById: db.getById, captureServerError, purgeByPolicy }
}

export type LogEventService = ReturnType<typeof createLogEventService>
