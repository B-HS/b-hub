import type { MetricsIngestInput } from '../../../dto/metrics/ingest'
import type { MetricsLogListQuery, MetricsSeriesQuery } from '../../../dto/metrics/query'

const OFFLINE_INTERVAL_FACTOR = 3
const OFFLINE_MIN_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_INTERVAL_SEC = 60

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

export type MetricsLogServiceDb = {
    insertLogs: (rows: MetricsLogRecord[]) => Promise<number>
    upsertDevice: (row: Omit<MetricsDeviceRecord, 'firstSeenAt' | 'lastSeenAt'> & { seenAt: Date }) => Promise<void>
    listLogs: (filter: MetricsLogListQuery) => Promise<{ rows: MetricsLogRecord[]; total: number }>
    listDevices: () => Promise<MetricsDeviceRecord[]>
    getDevice: (deviceId: string) => Promise<MetricsDeviceRecord | null>
    seriesPoints: (params: MetricsSeriesQuery) => Promise<{ t: Date; v: number }[]>
}

type MetricsLogServiceDeps = {
    db: MetricsLogServiceDb
}

const isOnline = (device: { intervalSec: number | null; lastSeenAt: Date }, now: Date) => {
    const thresholdMs = Math.max(OFFLINE_INTERVAL_FACTOR * (device.intervalSec ?? DEFAULT_INTERVAL_SEC) * 1000, OFFLINE_MIN_THRESHOLD_MS)
    return now.getTime() - device.lastSeenAt.getTime() < thresholdMs
}

export const createMetricsLogService = ({ db }: MetricsLogServiceDeps) => {
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
        for (const e of latestByDevice.values()) {
            await db.upsertDevice({
                deviceId: e.deviceId,
                tokenId: token.id,
                tokenAlias: token.alias,
                hostname: e.hostname ?? null,
                os: e.os ?? null,
                arch: e.arch ?? null,
                agentVersion: e.agentVersion ?? null,
                intervalSec: e.intervalSec ?? null,
                seenAt: receivedAt,
            })
        }
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

    return { ingest, list, listDevices, getDevice, series }
}

export type MetricsLogService = ReturnType<typeof createMetricsLogService>
