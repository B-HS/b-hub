import { describe, expect, test, mock } from 'bun:test'
import { createLogEventService } from '../../../../service/domain/logs/log-event'
import { createAppError } from '../../../../lib/error'
import type { LogEventFilter, NewLogEventInput } from '../../../../service/domain/logs/log-event'

const ALERTER_DELAY_MS = 10
const ALERTER_SETTLE_WAIT_MS = 30

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createMockDb = () => ({
    insertEvent: mock(async (_row: NewLogEventInput) => ({ id: 1 })),
    insertEvents: mock(async (rows: NewLogEventInput[]) => rows.length),
    resolveById: mock(async (_id: number, _at: Date) => true),
    listEvents: mock(async (_filter: LogEventFilter) => ({ rows: [] as never, total: 0 })),
    getById: mock(async (_id: number) => null),
    deleteOlderThan: mock(async (_before: Date, _maxSeverity: number, _limit: number) => 0),
    deleteWeatherApiLogsBefore: mock(async (_before: Date, _limit: number) => 0),
    deleteMailSyncLogsBefore: mock(async (_before: Date, _limit: number) => 0),
    deleteCompletedMailSyncSessionsBefore: mock(async (_before: Date, _limit: number) => 0),
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

    test('ingest는 alerter 완료를 기다리지 않고 반환하며 alerter 는 백그라운드에서 끝난다', async () => {
        const db = createMockDb()
        let settled = false
        const alerter = async () => {
            await sleep(ALERTER_DELAY_MS)
            settled = true
        }
        const service = createLogEventService({ db: db as never, alerter })
        await service.ingest({ service: 'a', errorCode: 'x', severity: 40 }, {})
        expect(settled).toBe(false)
        await sleep(ALERTER_SETTLE_WAIT_MS)
        expect(settled).toBe(true)
    })

    test('ingestBatch는 alerter 완료를 기다리지 않고 severity 조건에 맞는 행마다 alerter 를 띄운다', async () => {
        const db = createMockDb()
        let settled = 0
        const alerter = async () => {
            await sleep(ALERTER_DELAY_MS)
            settled += 1
        }
        const service = createLogEventService({ db: db as never, alerter })
        await service.ingestBatch(
            [
                { service: 'a', errorCode: 'x', severity: 40 },
                { service: 'b', errorCode: 'y', severity: 50 },
                { service: 'c', errorCode: 'z', severity: 10 },
            ],
            {},
        )
        expect(settled).toBe(0)
        await sleep(ALERTER_SETTLE_WAIT_MS)
        expect(settled).toBe(2)
    })

    test('captureServerError 도 alerter 완료를 기다리지 않는다', async () => {
        const db = createMockDb()
        let settled = false
        const alerter = async () => {
            await sleep(ALERTER_DELAY_MS)
            settled = true
        }
        const service = createLogEventService({ db: db as never, alerter })
        await service.captureServerError({ service: 'a', errorCode: 'x', severity: 40 })
        expect(settled).toBe(false)
        await sleep(ALERTER_SETTLE_WAIT_MS)
        expect(settled).toBe(true)
    })

    test('alerter 가 동기적으로 throw 해도 ingest 는 성공한다', async () => {
        const db = createMockDb()
        const alerter = () => {
            throw createAppError('EXTERNAL_API_ERROR')
        }
        const service = createLogEventService({ db: db as never, alerter })
        const res = await service.ingest({ service: 'a', errorCode: 'x', severity: 40 }, {})
        expect(res.id).toBe(1)
    })

    test('alerter 가 reject 해도 ingestBatch 는 성공한다', async () => {
        const db = createMockDb()
        const alerter = () => Promise.reject(createAppError('EXTERNAL_API_ERROR'))
        const service = createLogEventService({ db: db as never, alerter })
        const count = await service.ingestBatch([{ service: 'a', errorCode: 'x', severity: 40 }], {})
        expect(count).toBe(1)
        await sleep(ALERTER_SETTLE_WAIT_MS)
    })

    test('purgeByPolicy는 3개 보관 계층을 삭제한다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        await service.purgeByPolicy()
        expect(db.deleteOlderThan).toHaveBeenCalledTimes(3)
    })

    test('purgeByPolicy는 LIMIT 만큼 지워지면 같은 계층을 반복 삭제한다', async () => {
        const db = createMockDb()
        let round = 0
        db.deleteOlderThan = mock(async (_before: Date, _maxSeverity: number, limit: number) => {
            round += 1
            return round === 1 ? limit : 0
        })
        const service = createLogEventService({ db: db as never })

        const result = await service.purgeByPolicy()
        expect(db.deleteOlderThan).toHaveBeenCalledTimes(4)
        expect(result.infoDeleted).toBe(1000)
    })

    test('purgeRetention은 weather·mail 보존 테이블을 각각 정리한다', async () => {
        const db = createMockDb()
        db.deleteWeatherApiLogsBefore = mock(async (_before: Date, _limit: number) => 3)
        db.deleteMailSyncLogsBefore = mock(async (_before: Date, _limit: number) => 2)
        db.deleteCompletedMailSyncSessionsBefore = mock(async (_before: Date, _limit: number) => 1)
        const service = createLogEventService({ db: db as never })

        const result = await service.purgeRetention()
        expect(result).toEqual({ weatherApiLogDeleted: 3, mailSyncLogDeleted: 2, mailSyncSessionDeleted: 1 })
    })

    test('purgeRetention 보존 경계는 90일·90일·30일이다', async () => {
        const db = createMockDb()
        const service = createLogEventService({ db: db as never })
        const before = Date.now()

        await service.purgeRetention()

        const day = 24 * 60 * 60 * 1000
        const weatherCutoff = db.deleteWeatherApiLogsBefore.mock.calls[0][0].getTime()
        const mailLogCutoff = db.deleteMailSyncLogsBefore.mock.calls[0][0].getTime()
        const sessionCutoff = db.deleteCompletedMailSyncSessionsBefore.mock.calls[0][0].getTime()
        expect(Math.round((before - weatherCutoff) / day)).toBe(90)
        expect(Math.round((before - mailLogCutoff) / day)).toBe(90)
        expect(Math.round((before - sessionCutoff) / day)).toBe(30)
    })
})
