import { describe, expect, test } from 'bun:test'
import { createAdminDb, type AdminDb } from '../../../page/admin/db'
import type { Database } from '../../../db'

const COUNT_VALUE = 7
const SUM_VALUE = 4096
const SETTLE_TICKS = 2
const COUNTS_QUERY_COUNT = 17
const PAGE_PARAMS = { page: 1, size: 20 }

const settle = async (rows: unknown[]) => {
    for (let tick = 0; tick < SETTLE_TICKS; tick += 1) await Promise.resolve()
    return rows
}

const createTraceDb = (trace: string[]) => {
    let sequence = 0
    const createQuery = (label: string, rows: unknown[]) => {
        sequence += 1
        const id = `${label}#${sequence}`
        const query: Record<string, unknown> = {
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => {
                trace.push(`start ${id}`)
                return settle(rows)
                    .then((value) => {
                        trace.push(`end ${id}`)
                        return value
                    })
                    .then(resolve, reject)
            },
        }
        for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'groupBy', 'orderBy', 'limit', 'offset']) query[method] = () => query
        return query
    }
    return {
        select: (fields?: Record<string, unknown>) => {
            const keys = fields ? Object.keys(fields) : []
            if (keys.length === 1 && keys[0] === 'c') return createQuery('count', [{ c: COUNT_VALUE }])
            if (keys.length === 1 && keys[0] === 'b') return createQuery('sum', [{ b: SUM_VALUE }])
            return createQuery('rows', [{ id: 1 }])
        },
    } as unknown as Database
}

const expectAllStartsBeforeEnds = (trace: string[], queryCount: number) => {
    expect(trace.length).toBe(queryCount * 2)
    expect(trace.slice(0, queryCount).every((entry) => entry.startsWith('start '))).toBe(true)
    expect(trace.slice(queryCount).every((entry) => entry.startsWith('end '))).toBe(true)
}

const LIST_QUERIES: [string, (adminDb: AdminDb) => Promise<{ rows: unknown[]; total: number }>][] = [
    ['listUsers', (adminDb) => adminDb.listUsers(PAGE_PARAMS)],
    ['listSessions', (adminDb) => adminDb.listSessions(PAGE_PARAMS)],
    ['listApiTokens', (adminDb) => adminDb.listApiTokens(PAGE_PARAMS)],
    ['listApiLogs', (adminDb) => adminDb.listApiLogs(PAGE_PARAMS)],
    ['listLogEvents', (adminDb) => adminDb.listLogEvents(PAGE_PARAMS)],
    ['listPosts', (adminDb) => adminDb.listPosts(PAGE_PARAMS)],
    ['listComments', (adminDb) => adminDb.listComments(PAGE_PARAMS)],
    ['listImageAssets', (adminDb) => adminDb.listImageAssets(PAGE_PARAMS)],
    ['listMessages', (adminDb) => adminDb.listMessages(PAGE_PARAMS)],
    ['listFollows', (adminDb) => adminDb.listFollows(PAGE_PARAMS)],
    ['listWeatherKeys', (adminDb) => adminDb.listWeatherKeys(PAGE_PARAMS)],
    ['listWeatherLogs', (adminDb) => adminDb.listWeatherLogs(PAGE_PARAMS)],
    ['listMailAccounts', (adminDb) => adminDb.listMailAccounts(PAGE_PARAMS)],
    ['listMailSyncLogs', (adminDb) => adminDb.listMailSyncLogs(PAGE_PARAMS)],
    ['listMailSyncSessions', (adminDb) => adminDb.listMailSyncSessions(PAGE_PARAMS)],
    ['listMailMessages', (adminDb) => adminDb.listMailMessages(PAGE_PARAMS)],
    ['listMailUploads', (adminDb) => adminDb.listMailUploads(PAGE_PARAMS)],
    ['listSpotifyAccounts', (adminDb) => adminDb.listSpotifyAccounts(PAGE_PARAMS)],
    ['listSpotifyKeys', (adminDb) => adminDb.listSpotifyKeys(PAGE_PARAMS)],
    ['listSpotifyWidgetTokens', (adminDb) => adminDb.listSpotifyWidgetTokens(PAGE_PARAMS)],
    ['listResumes', (adminDb) => adminDb.listResumes(PAGE_PARAMS)],
    ['listCalendarGroups', (adminDb) => adminDb.listCalendarGroups(PAGE_PARAMS)],
    ['listCalendarEvents', (adminDb) => adminDb.listCalendarEvents(PAGE_PARAMS)],
    ['listCalendarSubscriptions', (adminDb) => adminDb.listCalendarSubscriptions(PAGE_PARAMS)],
    ['listDeletedCalendarEvents', (adminDb) => adminDb.listDeletedCalendarEvents(PAGE_PARAMS)],
    ['listDriveAssets', (adminDb) => adminDb.listDriveAssets(PAGE_PARAMS)],
    ['listDriveFolders', (adminDb) => adminDb.listDriveFolders(PAGE_PARAMS)],
    ['listLifecycleLogs', (adminDb) => adminDb.listLifecycleLogs(PAGE_PARAMS)],
    ['listAiProviders', (adminDb) => adminDb.listAiProviders(PAGE_PARAMS)],
    ['listAiSessions', (adminDb) => adminDb.listAiSessions(PAGE_PARAMS)],
    ['listAiPrompts', (adminDb) => adminDb.listAiPrompts(PAGE_PARAMS)],
]

describe('adminDb 목록 조회 (P-01)', () => {
    for (const [name, run] of LIST_QUERIES) {
        test(`${name} 는 count 와 목록 쿼리를 동시에 시작한다`, async () => {
            const trace: string[] = []
            await run(createAdminDb(createTraceDb(trace)))
            expectAllStartsBeforeEnds(trace, 2)
        })

        test(`${name} 는 { rows, total } 형태를 그대로 반환한다`, async () => {
            const result = await run(createAdminDb(createTraceDb([])))
            expect(result).toEqual({ rows: [{ id: 1 }], total: COUNT_VALUE })
        })
    }

    test('count 쿼리를 목록 쿼리보다 먼저 만든다 (기존 where 바인딩 순서 유지)', async () => {
        const trace: string[] = []
        await createAdminDb(createTraceDb(trace)).listUsers({ ...PAGE_PARAMS, q: 'hyun' })
        expect(trace[0]).toBe('start count#1')
        expect(trace[1]).toBe('start rows#2')
    })
})

describe('adminDb.counts (P-01)', () => {
    test('17개 카운트를 동시에 시작한다', async () => {
        const trace: string[] = []
        await createAdminDb(createTraceDb(trace)).counts()
        expectAllStartsBeforeEnds(trace, COUNTS_QUERY_COUNT)
    })

    test('대시보드 카운터 값과 키 구성이 HEAD 와 같다', async () => {
        const result = await createAdminDb(createTraceDb([])).counts()
        expect(result).toEqual({
            users: COUNT_VALUE,
            posts: COUNT_VALUE,
            comments: COUNT_VALUE,
            messages: COUNT_VALUE,
            mailAccounts: COUNT_VALUE,
            spotifyAccounts: COUNT_VALUE,
            resumes: COUNT_VALUE,
            calendarEvents: COUNT_VALUE,
            driveAssets: COUNT_VALUE,
            apiTokens: COUNT_VALUE,
            activeSessions: COUNT_VALUE,
            requests24h: COUNT_VALUE,
            errors24h: COUNT_VALUE,
            weatherLogs: COUNT_VALUE,
            logEvents24h: COUNT_VALUE,
            logErrors24h: COUNT_VALUE,
            storageBytes: SUM_VALUE,
        })
    })
})

describe('adminDb.weatherCacheSummary (P-01)', () => {
    test('세 캐시 카운트를 동시에 시작하고 같은 값을 반환한다', async () => {
        const trace: string[] = []
        const result = await createAdminDb(createTraceDb(trace)).weatherCacheSummary()
        expectAllStartsBeforeEnds(trace, 3)
        expect(result).toEqual({ current: COUNT_VALUE, ultra: COUNT_VALUE, short: COUNT_VALUE })
    })
})
