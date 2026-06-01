import { describe, expect, test, mock } from 'bun:test'
import { createLogEventService } from '../../../../service/domain/logs/log-event'
import type { LogEventFilter, NewLogEventInput } from '../../../../service/domain/logs/log-event'

const createMockDb = () => ({
    insertEvent: mock(async (_row: NewLogEventInput) => ({ id: 1 })),
    insertEvents: mock(async (rows: NewLogEventInput[]) => rows.length),
    resolveById: mock(async (_id: number, _at: Date) => true),
    listEvents: mock(async (_filter: LogEventFilter) => ({ rows: [] as never, total: 0 })),
    getById: mock(async (_id: number) => null),
    deleteOlderThan: mock(async (_before: Date, _maxSeverity: number) => 0),
})

describe('createLogEventService', () => {
    test('ingest는 정규화된 row로 insertEvent를 호출한다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        const res = await service.ingest({ service: 'esp32', errorCode: 'E', severity: 40 }, { ingestIp: '1.2.3.4', source: 'device' })
        expect(res.id).toBe(1)
        const row = db.insertEvent.mock.calls[0][0]
        expect(row.service).toBe('esp32')
        expect(row.ingestIp).toBe('1.2.3.4')
        expect(row.source).toBe('device')
    })

    test('ingestBatch는 모든 이벤트를 매핑해 insertEvents를 호출한다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        const count = await service.ingestBatch(
            [
                { service: 'a', errorCode: 'x', severity: 20 },
                { service: 'b', errorCode: 'y', severity: 30 },
            ],
            {},
        )
        expect(count).toBe(2)
    })

    test('resolve는 resolvedAt 기본값으로 현재 시각을 쓴다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        await service.resolve(7)
        const [id, at] = db.resolveById.mock.calls[0]
        expect(id).toBe(7)
        expect(at).toBeInstanceOf(Date)
    })

    test('captureServerError는 source=server, occurredAt=null로 적재한다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        await service.captureServerError({ service: 'b-hub-mail', errorCode: 'MAIL_PROVIDER_ERROR', severity: 40 })
        const row = db.insertEvent.mock.calls[0][0]
        expect(row.source).toBe('server')
        expect(row.occurredAt).toBeNull()
    })

    test('alerter는 severity>=40에서만 호출된다', async () => {
        const db = createMockDb()
        const alerter = mock((_e: { service: string; errorCode: string; severity: number }) => {})
        const service = createLogEventService({ db: db as never, alerter })
        await service.ingest({ service: 'a', errorCode: 'x', severity: 30 }, {})
        expect(alerter).not.toHaveBeenCalled()
        await service.ingest({ service: 'a', errorCode: 'x', severity: 40 }, {})
        expect(alerter).toHaveBeenCalledTimes(1)
    })

    test('purgeByPolicy는 3개 보관 계층을 삭제한다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        await service.purgeByPolicy()
        expect(db.deleteOlderThan).toHaveBeenCalledTimes(3)
    })
})
