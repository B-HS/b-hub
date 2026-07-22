import type { MetricsIngestInput } from '../../../dto/metrics/ingest'
import type { MetricsLogListQuery, MetricsSeriesQuery } from '../../../dto/metrics/query'

const OFFLINE_INTERVAL_FACTOR = 3
const OFFLINE_MIN_THRESHOLD_MS = 5 * 60 * 1000
const DEFAULT_INTERVAL_SEC = 60
const DOWN_ALERT_SEVERITY = 40
const RECOVER_ALERT_SEVERITY = 20

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
    downAlertedAt: Date | null
}

export type MetricsLogServiceDb = {
    insertLogs: (rows: MetricsLogRecord[]) => Promise<number>
    upsertDevice: (row: Omit<MetricsDeviceRecord, 'firstSeenAt' | 'lastSeenAt' | 'downAlertedAt'> & { seenAt: Date }) => Promise<void>
    listLogs: (filter: MetricsLogListQuery) => Promise<{ rows: MetricsLogRecord[]; total: number }>
    listDevices: () => Promise<MetricsDeviceRecord[]>
    getDevice: (deviceId: string) => Promise<MetricsDeviceRecord | null>
    seriesPoints: (params: MetricsSeriesQuery) => Promise<{ t: Date; v: number }[]>
    setDeviceAlerted: (deviceId: string, at: Date | null) => Promise<void>
}

export type MetricsAlerter = (event: {
    service: string
    errorCode: string
    severity: number
    errorDescription?: string | null
    deviceId?: string | null
}) => void

type MetricsLogServiceDeps = {
    db: MetricsLogServiceDb
    alerter?: MetricsAlerter
}

const isOnline = (device: { intervalSec: number | null; lastSeenAt: Date }, now: Date) => {
    const thresholdMs = Math.max(OFFLINE_INTERVAL_FACTOR * (device.intervalSec ?? DEFAULT_INTERVAL_SEC) * 1000, OFFLINE_MIN_THRESHOLD_MS)
    return now.getTime() - device.lastSeenAt.getTime() < thresholdMs
}

export const createMetricsLogService = ({ db, alerter }: MetricsLogServiceDeps) => {
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

    const checkHeartbeats = async (now = new Date()) => {
        const devices = await db.listDevices()
        const down: string[] = []
        const recovered: string[] = []

        for (const device of devices) {
            const online = isOnline(device, now)
            if (!online && !device.downAlertedAt) {
                down.push(device.deviceId)
                await db.setDeviceAlerted(device.deviceId, now)
                alerter?.({
                    service: 'metrics',
                    errorCode: 'METRICS_DEVICE_DOWN',
                    severity: DOWN_ALERT_SEVERITY,
                    errorDescription: `마지막 수신 ${device.lastSeenAt.toISOString()} (${device.tokenAlias})`,
                    deviceId: device.deviceId,
                })
            }
            if (online && device.downAlertedAt) {
                recovered.push(device.deviceId)
                await db.setDeviceAlerted(device.deviceId, null)
                alerter?.({
                    service: 'metrics',
                    errorCode: 'METRICS_DEVICE_RECOVERED',
                    severity: RECOVER_ALERT_SEVERITY,
                    errorDescription: `수신 재개 ${device.lastSeenAt.toISOString()} (${device.tokenAlias})`,
                    deviceId: device.deviceId,
                })
            }
        }
        return { down, recovered }
    }

    return { ingest, list, listDevices, getDevice, series, checkHeartbeats }
}

export type MetricsLogService = ReturnType<typeof createMetricsLogService>
