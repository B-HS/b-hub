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
    listArchiveDayKeys: mock(async (_before: Date) => [] as string[]),
    findLogsBetween: mock(async (_from: Date, _to: Date) => [] as MetricsLogRecord[]),
    deleteLogsBetween: mock(async (_from: Date, _to: Date) => 0),
    ...overrides,
})

const noopUpload = mock(async (_day: string, _jsonl: string) => {})

describe('createMetricsLogService', () => {
    test('ingest는 메타를 정규화해 저장하고 디바이스별 최신 이벤트로 upsert한다', async () => {
        const db = createMockDb()
        const service = createMetricsLogService({ db: db as never, uploadArchive: noopUpload })
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
        const service = createMetricsLogService({ db: db as never, uploadArchive: noopUpload })
        const devices = await service.listDevices(now)
        expect(devices.find((d) => d.deviceId === 'fresh')?.online).toBe(true)
        expect(devices.find((d) => d.deviceId === 'stale')?.online).toBe(false)
        expect(devices.find((d) => d.deviceId === 'slow-ok')?.online).toBe(true)
    })

    test('getDevice는 미존재 시 null, 존재 시 online을 포함해 반환한다', async () => {
        const now = new Date()
        const missing = createMetricsLogService({ db: createMockDb() as never, uploadArchive: noopUpload })
        expect(await missing.getDevice('ghost', now)).toBeNull()

        const found = createMetricsLogService({
            db: createMockDb({ getDevice: mock(async () => sampleDevice({ lastSeenAt: new Date(now.getTime() - 60_000) })) }) as never,
            uploadArchive: noopUpload,
        })
        const device = await found.getDevice('mac-1', now)
        expect(device?.online).toBe(true)
    })

    test('archiveOldLogs는 7일 경과 일자만 업로드 후 삭제하고 빈 일자는 건너뛴다', async () => {
        const now = new Date('2026-07-22T10:30:00Z')
        const order: string[] = []
        const oldRows = [
            {
                tokenId: 1,
                tokenAlias: 'demo-mbp',
                deviceId: 'mac-1',
                hostname: null,
                os: null,
                arch: null,
                agentVersion: null,
                payload: { cpu: { usage: 1 } },
                receivedAt: new Date('2026-07-10T05:00:00Z'),
            },
            {
                tokenId: 1,
                tokenAlias: 'demo-mbp',
                deviceId: 'mac-1',
                hostname: null,
                os: null,
                arch: null,
                agentVersion: null,
                payload: { cpu: { usage: 2 } },
                receivedAt: new Date('2026-07-10T06:00:00Z'),
            },
        ]
        const db = createMockDb({
            listArchiveDayKeys: mock(async (before: Date) => {
                order.push(`list:${before.toISOString()}`)
                return ['2026-07-10', '2026-07-11']
            }),
            findLogsBetween: mock(async (from: Date) => (from.toISOString().startsWith('2026-07-10') ? oldRows : [])),
            deleteLogsBetween: mock(async (from: Date) => {
                order.push(`delete:${from.toISOString().slice(0, 10)}`)
                return 2
            }),
        })
        const uploadArchive = mock(async (day: string, jsonl: string) => {
            order.push(`upload:${day}`)
            const lines = jsonl.split('\n').map((l) => JSON.parse(l))
            expect(lines).toHaveLength(2)
            expect(lines[0].receivedAt).toBe('2026-07-10T05:00:00.000Z')
        })
        const service = createMetricsLogService({ db: db as never, uploadArchive })
        const result = await service.archiveOldLogs(now)

        expect(order).toEqual(['list:2026-07-15T00:00:00.000Z', 'upload:2026-07-10', 'delete:2026-07-10'])
        expect(result.archived).toEqual([{ day: '2026-07-10', count: 2, deleted: 2 }])
        expect(result.totalArchived).toBe(2)
        expect(result.totalDeleted).toBe(2)
    })
})
