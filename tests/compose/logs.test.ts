import { afterEach, beforeEach, describe, expect, test, mock, setSystemTime } from 'bun:test'
import { composeLogs } from '../../compose/logs'
import { resetDiscordAlertBudget } from '../../lib/discord'

const ALERT_THROTTLE_MAX_KEYS = 500
const THROTTLE_HALF_WINDOW_MS = 30_000
const THROTTLE_WINDOW_PASSED_MS = 61_000
const BASE_TIME_MS = 1_700_000_000_000
const DISCORD_DELAY_MS = 10
const DISCORD_SETTLE_WAIT_MS = 30

const COUNT_DELAY_MS = 20
const ROWS_DELAY_MS = 5
const LIST_TOTAL = 42

const createDb = () => ({
    insert: () => ({ values: () => ({ $returningId: async () => [{ id: 1 }] }) }),
})

const createListEventsDb = (timeline: string[], rows: { id: number }[]) => {
    const whereArgs: unknown[] = []
    const thenable = <T>(label: string, value: T, delayMs: number) => ({
        then: (resolve: (v: T) => void) => {
            timeline.push(`start:${label}`)
            setTimeout(() => {
                timeline.push(`end:${label}`)
                resolve(value)
            }, delayMs)
        },
    })
    const countChain = { from: () => ({ where: (w: unknown) => (whereArgs.push(w), thenable('count', [{ total: LIST_TOTAL }], COUNT_DELAY_MS)) }) }
    const rowsChain = {
        from: () => ({
            where: (w: unknown) => (
                whereArgs.push(w),
                { orderBy: () => ({ limit: () => ({ offset: () => thenable('rows', rows, ROWS_DELAY_MS) }) }) }
            ),
        }),
    }
    return { db: { select: (fields?: unknown) => (fields === undefined ? rowsChain : countChain) }, whereArgs }
}

const createEnv = () => ({ DISCORD_WEBHOOK_URL: 'https://discord.test/hook' })

const originalFetch = globalThis.fetch

const stubFetch = () => {
    const fetchMock = mock(() => Promise.resolve({ ok: true, status: 204 } as Response))
    globalThis.fetch = fetchMock as never
    return fetchMock
}

const alertEvent = (errorCode: string) => ({ service: 'esp32', errorCode, severity: 40 })

beforeEach(() => {
    resetDiscordAlertBudget()
})

afterEach(() => {
    globalThis.fetch = originalFetch
    setSystemTime()
})

describe('composeLogs 알림 throttle', () => {
    test('같은 service:errorCode 는 1분 안에 한 번만 알린다', async () => {
        const fetchMock = stubFetch()
        const { logEventService } = composeLogs({ db: createDb() as never, env: createEnv() as never })

        await logEventService.ingest(alertEvent('E_SAME'), {})
        resetDiscordAlertBudget()
        await logEventService.ingest(alertEvent('E_SAME'), {})

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    test('throttle Map 이 상한을 넘으면 오래된 키부터 제거한다', async () => {
        const fetchMock = stubFetch()
        const { logEventService } = composeLogs({ db: createDb() as never, env: createEnv() as never })

        await logEventService.ingest(alertEvent('E_FIRST'), {})
        for (let i = 0; i < ALERT_THROTTLE_MAX_KEYS + 1; i++) {
            resetDiscordAlertBudget()
            await logEventService.ingest(alertEvent(`E_${i}`), {})
        }

        const callsBefore = fetchMock.mock.calls.length
        resetDiscordAlertBudget()
        await logEventService.ingest(alertEvent('E_FIRST'), {})

        expect(fetchMock.mock.calls.length).toBe(callsBefore + 1)
    })

    test('ingest 는 Discord 전송 완료를 기다리지 않고 반환하며 전송은 백그라운드에서 끝난다', async () => {
        let delivered = false
        globalThis.fetch = (async () => {
            await new Promise((resolve) => setTimeout(resolve, DISCORD_DELAY_MS))
            delivered = true
            return { ok: true, status: 204 } as Response
        }) as never
        const { logEventService } = composeLogs({ db: createDb() as never, env: createEnv() as never })

        await logEventService.ingest(alertEvent('E_BACKGROUND'), {})

        expect(delivered).toBe(false)
        await new Promise((resolve) => setTimeout(resolve, DISCORD_SETTLE_WAIT_MS))
        expect(delivered).toBe(true)
    })

    test('Discord 전송이 실패해도 ingest 는 성공한다', async () => {
        globalThis.fetch = (() => Promise.reject(new Error('network down'))) as never
        const { logEventService } = composeLogs({ db: createDb() as never, env: createEnv() as never })

        const res = await logEventService.ingest(alertEvent('E_FAIL'), {})

        expect(res.id).toBe(1)
    })

    test('다시 알린 키는 축출 순서가 갱신되어 살아남는다', async () => {
        const fetchMock = stubFetch()
        const { logEventService } = composeLogs({ db: createDb() as never, env: createEnv() as never })

        const alertAt = async (at: number, errorCode: string) => {
            setSystemTime(new Date(at))
            resetDiscordAlertBudget()
            await logEventService.ingest(alertEvent(errorCode), {})
        }

        await alertAt(BASE_TIME_MS, 'E_HOT')
        for (let i = 0; i < ALERT_THROTTLE_MAX_KEYS - 1; i++) {
            await alertAt(BASE_TIME_MS + THROTTLE_HALF_WINDOW_MS, `E_COLD_${i}`)
        }
        await alertAt(BASE_TIME_MS + THROTTLE_WINDOW_PASSED_MS, 'E_HOT')
        await alertAt(BASE_TIME_MS + THROTTLE_WINDOW_PASSED_MS, 'E_OVERFLOW')

        const callsBefore = fetchMock.mock.calls.length
        await alertAt(BASE_TIME_MS + THROTTLE_WINDOW_PASSED_MS, 'E_HOT')

        expect(fetchMock.mock.calls.length).toBe(callsBefore)
    })

    test('DISCORD_WEBHOOK_URL 이 없으면 알리지 않는다', async () => {
        const fetchMock = stubFetch()
        const { logEventService } = composeLogs({ db: createDb() as never, env: {} as never })

        await logEventService.ingest(alertEvent('E_NO_HOOK'), {})

        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('composeLogs listEvents', () => {
    test('count 와 목록 조회를 병렬로 실행한다', async () => {
        const timeline: string[] = []
        const { db } = createListEventsDb(timeline, [{ id: 1 }])
        const { logEventService } = composeLogs({ db: db as never, env: {} as never })

        await logEventService.list({ limit: 20, offset: 0 })

        expect(timeline).toEqual(['start:count', 'start:rows', 'end:rows', 'end:count'])
    })

    test('응답은 { rows, total } 형태를 그대로 유지한다', async () => {
        const rows = [{ id: 1 }, { id: 2 }]
        const { db } = createListEventsDb([], rows)
        const { logEventService } = composeLogs({ db: db as never, env: {} as never })

        expect(await logEventService.list({ limit: 20, offset: 0 })).toEqual({ rows, total: LIST_TOTAL })
    })

    test('두 쿼리에 같은 where 조건을 넘긴다', async () => {
        const { db, whereArgs } = createListEventsDb([], [])
        const { logEventService } = composeLogs({ db: db as never, env: {} as never })

        await logEventService.list({ service: 'esp32', unresolved: true, limit: 10, offset: 30 })

        expect(whereArgs).toHaveLength(2)
        expect(whereArgs[0]).toBe(whereArgs[1])
        expect(whereArgs[0]).toBeDefined()
    })

    test('필터가 없으면 where 조건도 undefined 로 동일하다', async () => {
        const { db, whereArgs } = createListEventsDb([], [])
        const { logEventService } = composeLogs({ db: db as never, env: {} as never })

        await logEventService.list({ limit: 20, offset: 0 })

        expect(whereArgs).toEqual([undefined, undefined])
    })
})
