import { describe, expect, test, mock } from 'bun:test'
import { createMetricsLogService } from '../../../../service/domain/metrics/log'
import type { MetricsDeviceRecord, MetricsLogRecord } from '../../../../service/domain/metrics/log'

const sampleDevice = (overrides: Partial<MetricsDeviceRecord> = {}): MetricsDeviceRecord => ({
    deviceId: 'mac-1',
    tokenId: 1,
    tokenAlias: 'demo-mbp',
    hostname: 'mbp.local',
    os: 'macos',
    arch: 'aarch64',
    agentVersion: 'machboard@0.1.0',
    intervalSec: 60,
    firstSeenAt: new Date('2026-07-01T00:00:00Z'),
    lastSeenAt: new Date(),
    ...overrides,
})

const createMockDb = (overrides: Record<string, unknown> = {}) => ({
    insertLogs: mock(async (rows: MetricsLogRecord[]) => rows.length),
    upsertDevice: mock(async (_row: { deviceId: string }) => {}),
    listLogs: mock(async () => ({ rows: [] as MetricsLogRecord[], total: 0 })),
    listDevices: mock(async () => [] as MetricsDeviceRecord[]),
    getDevice: mock(async (_deviceId: string) => null as MetricsDeviceRecord | null),
    seriesPoints: mock(async () => [] as { t: Date; v: number }[]),
    ...overrides,
})

describe('createMetricsLogService', () => {
    test('ingest는 메타를 정규화해 저장하고 디바이스별 최신 이벤트로 upsert한다', async () => {
        const db = createMockDb()
        const service = createMetricsLogService({ db: db as never })
        const count = await service.ingest({ id: 1, alias: 'demo-mbp' }, [
            { deviceId: 'mac-1', payload: { seq: 1 } },
            { deviceId: 'mac-1', intervalSec: 60, payload: { seq: 2 } },
            { deviceId: 'esp32-1', payload: {} },
        ])
        expect(count).toBe(3)
        const row = db.insertLogs.mock.calls[0][0][0]
        expect(row.tokenId).toBe(1)
        expect(row.tokenAlias).toBe('demo-mbp')
        expect(row.hostname).toBeNull()
        expect(row.receivedAt).toBeInstanceOf(Date)
        expect(db.upsertDevice).toHaveBeenCalledTimes(2)
        const macUpsert = db.upsertDevice.mock.calls[0][0] as { deviceId: string; intervalSec: number | null }
        expect(macUpsert.deviceId).toBe('mac-1')
        expect(macUpsert.intervalSec).toBe(60)
    })

    test('listDevices는 임계(3x interval, 최소 5분) 기준으로 online을 계산한다', async () => {
        const now = new Date()
        const db = createMockDb({
            listDevices: mock(async () => [
                sampleDevice({ deviceId: 'fresh', lastSeenAt: new Date(now.getTime() - 60_000) }),
                sampleDevice({ deviceId: 'stale', lastSeenAt: new Date(now.getTime() - 10 * 60_000) }),
                sampleDevice({ deviceId: 'slow-ok', intervalSec: 600, lastSeenAt: new Date(now.getTime() - 20 * 60_000) }),
            ]),
        })
        const service = createMetricsLogService({ db: db as never })
        const devices = await service.listDevices(now)
        expect(devices.find((d) => d.deviceId === 'fresh')?.online).toBe(true)
        expect(devices.find((d) => d.deviceId === 'stale')?.online).toBe(false)
        expect(devices.find((d) => d.deviceId === 'slow-ok')?.online).toBe(true)
    })

    test('getDevice는 미존재 시 null, 존재 시 online을 포함해 반환한다', async () => {
        const now = new Date()
        const missing = createMetricsLogService({ db: createMockDb() as never })
        expect(await missing.getDevice('ghost', now)).toBeNull()

        const found = createMetricsLogService({
            db: createMockDb({ getDevice: mock(async () => sampleDevice({ lastSeenAt: new Date(now.getTime() - 60_000) })) }) as never,
        })
        const device = await found.getDevice('mac-1', now)
        expect(device?.online).toBe(true)
    })
})
