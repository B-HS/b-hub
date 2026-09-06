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

const createArchiveStorage = (existingKeys: string[] = []) => ({
    listKeys: mock(async (_prefix: string) => existingKeys),
    upload: mock(async (_key: string, _jsonl: string) => {}),
})

describe('createMetricsLogService', () => {
    test('ingest는 메타를 정규화해 저장하고 디바이스별 최신 이벤트로 upsert한다', async () => {
        const db = createMockDb()
        const service = createMetricsLogService({ db: db as never, archiveStorage: createArchiveStorage() })
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
        const service = createMetricsLogService({ db: db as never, archiveStorage: createArchiveStorage() })
        const devices = await service.listDevices(now)
        expect(devices.find((d) => d.deviceId === 'fresh')?.online).toBe(true)
        expect(devices.find((d) => d.deviceId === 'stale')?.online).toBe(false)
        expect(devices.find((d) => d.deviceId === 'slow-ok')?.online).toBe(true)
    })

    test('getDevice는 미존재 시 null, 존재 시 online을 포함해 반환한다', async () => {
        const now = new Date()
        const missing = createMetricsLogService({ db: createMockDb() as never, archiveStorage: createArchiveStorage() })
        expect(await missing.getDevice('ghost', now)).toBeNull()

        const found = createMetricsLogService({
            db: createMockDb({ getDevice: mock(async () => sampleDevice({ lastSeenAt: new Date(now.getTime() - 60_000) })) }) as never,
            archiveStorage: createArchiveStorage(),
        })
        const device = await found.getDevice('mac-1', now)
        expect(device?.online).toBe(true)
    })

    test('재실행 시 기존 파트를 덮어쓰지 않고 다음 파트 키로 업로드한다', async () => {
        const now = new Date('2026-07-22T10:30:00Z')
        const rows = [
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
        ]
        const db = createMockDb({
            listArchiveDayKeys: mock(async () => ['2026-07-10']),
            findLogsBetween: mock(async () => rows),
            deleteLogsBetween: mock(async () => 1),
        })
        const archiveStorage = createArchiveStorage(['metrics-archive/2026-07-10/0.jsonl.gz', 'metrics-archive/2026-07-10/1.jsonl.gz'])
        const service = createMetricsLogService({ db: db as never, archiveStorage })
        await service.archiveOldLogs(now)

        expect(archiveStorage.upload.mock.calls[0][0]).toBe('metrics-archive/2026-07-10/2.jsonl.gz')
    })

    test('삭제 건수가 아카이브 건수와 다르면 결과에 그대로 드러내고 실패하지 않는다', async () => {
        const now = new Date('2026-07-22T10:30:00Z')
        const rows = [
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
        ]
        const db = createMockDb({
            listArchiveDayKeys: mock(async () => ['2026-07-10']),
            findLogsBetween: mock(async () => rows),
            deleteLogsBetween: mock(async () => 0),
        })
        const service = createMetricsLogService({ db: db as never, archiveStorage: createArchiveStorage() })
        const result = await service.archiveOldLogs(now)

        expect(result.archived).toEqual([{ day: '2026-07-10', count: 1, deleted: 0 }])
        expect(result.totalArchived).toBe(1)
        expect(result.totalDeleted).toBe(0)
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
        const archiveStorage = {
            listKeys: mock(async (_prefix: string) => []),
            upload: mock(async (key: string, jsonl: string) => {
                order.push(`upload:${key}`)
                const lines = jsonl.split('\n').map((l) => JSON.parse(l))
                expect(lines).toHaveLength(2)
                expect(lines[0].receivedAt).toBe('2026-07-10T05:00:00.000Z')
            }),
        }
        const service = createMetricsLogService({ db: db as never, archiveStorage })
        const result = await service.archiveOldLogs(now)

        expect(archiveStorage.listKeys.mock.calls[0][0]).toBe('metrics-archive/2026-07-10/')
        expect(order).toEqual(['list:2026-07-15T00:00:00.000Z', 'upload:metrics-archive/2026-07-10/0.jsonl.gz', 'delete:2026-07-10'])
        expect(result.archived).toEqual([{ day: '2026-07-10', count: 2, deleted: 2 }])
        expect(result.totalArchived).toBe(2)
        expect(result.totalDeleted).toBe(2)
    })
})

describe('archiveOldLogs 실행 예산', () => {
    const row = (day: string): MetricsLogRecord => ({
        tokenId: 1,
        tokenAlias: 'demo-mbp',
        deviceId: 'mac-1',
        hostname: null,
        os: null,
        arch: null,
        agentVersion: null,
        payload: { cpu: { usage: 1 } },
        receivedAt: new Date(`${day}T05:00:00Z`),
    })

    test('한 번의 실행에서 최대 3일만 처리한다', async () => {
        const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']
        const db = createMockDb({
            listArchiveDayKeys: mock(async (_before: Date) => days),
            findLogsBetween: mock(async (from: Date) => [row(from.toISOString().slice(0, 10))]),
            deleteLogsBetween: mock(async (_from: Date, _to: Date) => 1),
        })
        const archiveStorage = createArchiveStorage()
        const service = createMetricsLogService({ db: db as never, archiveStorage })

        const result = await service.archiveOldLogs(new Date('2026-07-22T10:30:00Z'))

        expect(result.archived.map((a) => a.day)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
        expect(archiveStorage.upload).toHaveBeenCalledTimes(3)
        expect(result.totalArchived).toBe(3)
    })
})
