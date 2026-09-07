import { captureException } from '../../../lib/sentry'
import type { MetricsIngestInput } from '../../../dto/metrics/ingest'
import type { MetricsLogListQuery, MetricsSeriesQuery } from '../../../dto/metrics/query'

const OFFLINE_INTERVAL_FACTOR = 3
const OFFLINE_MIN_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_INTERVAL_SEC = 60
const DAY_MS = 24 * 60 * 60 * 1000
const HOT_RETENTION_DAYS = 7
const ARCHIVE_KEY_PREFIX = 'metrics-archive'
const ARCHIVE_KEY_SUFFIX = '.jsonl.gz'
const ARCHIVE_MAX_DAYS_PER_RUN = 3
const ARCHIVE_TIME_BUDGET_MS = 200_000

export type MetricsLogRecord = {
    tokenId: number
    tokenAlias: string
    deviceId: string
    hostname: string | null
    os: string | null
    arch: string | null
    agentVersion: string | null
    payload: Record<string, unknown>
    receivedAt: Date
}

export type MetricsDeviceRecord = {
    deviceId: string
    tokenId: number
    tokenAlias: string
    hostname: string | null
    os: string | null
    arch: string | null
    agentVersion: string | null
    intervalSec: number | null
    firstSeenAt: Date
    lastSeenAt: Date
}

export type MetricsDeviceUpsert = Omit<MetricsDeviceRecord, 'firstSeenAt' | 'lastSeenAt'> & { seenAt: Date }

export type MetricsLogServiceDb = {
    insertLogs: (rows: MetricsLogRecord[]) => Promise<number>
    upsertDevices: (rows: MetricsDeviceUpsert[]) => Promise<void>
    listLogs: (filter: MetricsLogListQuery) => Promise<{ rows: MetricsLogRecord[]; total: number }>
    listDevices: () => Promise<MetricsDeviceRecord[]>
    getDevice: (deviceId: string) => Promise<MetricsDeviceRecord | null>
    seriesPoints: (params: MetricsSeriesQuery) => Promise<{ t: Date; v: number }[]>
    listArchiveDayKeys: (before: Date) => Promise<string[]>
    findLogsBetween: (from: Date, to: Date) => Promise<MetricsLogRecord[]>
    deleteLogsBetween: (from: Date, to: Date) => Promise<number>
}

export type MetricsArchiveStorage = {
    listKeys: (prefix: string) => Promise<string[]>
    upload: (key: string, jsonl: string) => Promise<void>
}

type MetricsLogServiceDeps = {
    db: MetricsLogServiceDb
    archiveStorage: MetricsArchiveStorage
}

const isOnline = (device: { intervalSec: number | null; lastSeenAt: Date }, now: Date) => {
    const thresholdMs = Math.max(OFFLINE_INTERVAL_FACTOR * (device.intervalSec ?? DEFAULT_INTERVAL_SEC) * 1000, OFFLINE_MIN_THRESHOLD_MS)
    return now.getTime() - device.lastSeenAt.getTime() < thresholdMs
}

const nextArchiveKey = (day: string, existingKeys: string[]) => {
    const prefix = `${ARCHIVE_KEY_PREFIX}/${day}/`
    const used = new Set(existingKeys)
    let part = 0
    while (used.has(`${prefix}${part}${ARCHIVE_KEY_SUFFIX}`)) part += 1
    return `${prefix}${part}${ARCHIVE_KEY_SUFFIX}`
}

export const createMetricsLogService = ({ db, archiveStorage }: MetricsLogServiceDeps) => {
    const ingest = async (token: { id: number; alias: string }, events: MetricsIngestInput[]) => {
        const receivedAt = new Date()
        const rows = events.map((e) => ({
            tokenId: token.id,
            tokenAlias: token.alias,
            deviceId: e.deviceId,
            hostname: e.hostname ?? null,
            os: e.os ?? null,
            arch: e.arch ?? null,
            agentVersion: e.agentVersion ?? null,
            payload: e.payload,
            receivedAt,
        }))
        const count = await db.insertLogs(rows)

        const latestByDevice = new Map<string, MetricsIngestInput>()
        events.forEach((e) => latestByDevice.set(e.deviceId, e))
        await db.upsertDevices(
            [...latestByDevice.values()].map((e) => ({
                deviceId: e.deviceId,
                tokenId: token.id,
                tokenAlias: token.alias,
                hostname: e.hostname ?? null,
                os: e.os ?? null,
                arch: e.arch ?? null,
                agentVersion: e.agentVersion ?? null,
                intervalSec: e.intervalSec ?? null,
                seenAt: receivedAt,
            })),
        )
        return count
    }

    const list = async (filter: MetricsLogListQuery) => db.listLogs(filter)

    const listDevices = async (now = new Date()) => {
        const devices = await db.listDevices()
        return devices.map((d) => ({ ...d, online: isOnline(d, now) }))
    }

    const getDevice = async (deviceId: string, now = new Date()) => {
        const device = await db.getDevice(deviceId)
        if (!device) return null
        return { ...device, online: isOnline(device, now) }
    }

    const series = async (params: MetricsSeriesQuery) => db.seriesPoints(params)

    const archiveOldLogs = async (now = new Date()) => {
        const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        const cutoff = new Date(todayUtc - HOT_RETENTION_DAYS * DAY_MS)
        const days = await db.listArchiveDayKeys(cutoff)
        const archived: { day: string; count: number; deleted: number }[] = []
        const startedAt = Date.now()

        for (const day of days.slice(0, ARCHIVE_MAX_DAYS_PER_RUN)) {
            if (Date.now() - startedAt >= ARCHIVE_TIME_BUDGET_MS) break
            const from = new Date(`${day}T00:00:00.000Z`)
            const to = new Date(from.getTime() + DAY_MS)
            const rows = await db.findLogsBetween(from, to)
            if (rows.length === 0) continue
            const jsonl = rows.map((r) => JSON.stringify({ ...r, receivedAt: r.receivedAt.toISOString() })).join('\n')
            const existingKeys = await archiveStorage.listKeys(`${ARCHIVE_KEY_PREFIX}/${day}/`)
            await archiveStorage.upload(nextArchiveKey(day, existingKeys), jsonl)
            const deleted = await db.deleteLogsBetween(from, to)
            if (deleted !== rows.length)
                captureException(new Error(`metrics archive mismatch on ${day}: archived ${rows.length}, deleted ${deleted}`))
            archived.push({ day, count: rows.length, deleted })
        }

        return {
            cutoff: cutoff.toISOString(),
            archived,
            totalArchived: archived.reduce((sum, d) => sum + d.count, 0),
            totalDeleted: archived.reduce((sum, d) => sum + d.deleted, 0),
        }
    }

    return { ingest, list, listDevices, getDevice, series, archiveOldLogs }
}

export type MetricsLogService = ReturnType<typeof createMetricsLogService>
