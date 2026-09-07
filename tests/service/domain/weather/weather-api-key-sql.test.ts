import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from '../../../../db/schema'
import { createWeatherApiKeyService } from '../../../../service/domain/weather/weather-api-key'

type CapturedQuery = { sql: string; values: unknown[] }

const KEY_ROW = [1, 'user-1', 'hashed', 'test', 100, null, null, new Date('2026-09-01T00:00:00.000Z')]

const createCapturingDb = (captured: CapturedQuery[], rows: unknown[][]) => {
    const run = async (config: { sql: string; values: unknown[] }) => {
        captured.push({ sql: config.sql, values: config.values })
        if (!config.sql.startsWith('select')) return [{ affectedRows: 1 }, []]
        return [rows, []]
    }

    return drizzle({ query: run, execute: run } as never, { schema, mode: 'default' })
}

describe('weatherApiKeyService.validate 의 SQL', () => {
    test('키 조회와 24시간 사용량을 한 번의 SQL 로 읽는다', async () => {
        const captured: CapturedQuery[] = []
        const service = createWeatherApiKeyService({ db: createCapturingDb(captured, [[...KEY_ROW, 7]]) })

        const record = await service.validate('some-token')

        const selects = captured.filter((q) => q.sql.startsWith('select'))
        expect(selects).toHaveLength(1)
        expect(selects[0].sql).toContain('`weather_api_key`')
        expect(selects[0].sql).toContain('COUNT(*)')
        expect(selects[0].sql).toContain('`weather_api_log`')
        expect(selects[0].sql).toContain('`weather_api_log`.`key_id` = `weather_api_key`.`id`')
        expect(record?.id).toBe(1)
    })

    test('응답 레코드에 recentUsage 가 섞이지 않는다', async () => {
        const captured: CapturedQuery[] = []
        const service = createWeatherApiKeyService({ db: createCapturingDb(captured, [[...KEY_ROW, 7]]) })

        const record = await service.validate('some-token')

        expect(record).not.toBeNull()
        expect(Object.keys(record!)).toEqual(['id', 'userId', 'token', 'name', 'dailyLimit', 'expiresAt', 'lastUsedAt', 'createdAt'])
    })

    test('validate 가 읽은 사용량으로 checkRateLimit 이 추가 조회 없이 판정한다', async () => {
        const captured: CapturedQuery[] = []
        const service = createWeatherApiKeyService({ db: createCapturingDb(captured, [[...KEY_ROW, 100]]) })

        const record = await service.validate('some-token')
        const before = captured.length
        const allowed = await service.checkRateLimit(record!.id, record!.dailyLimit)

        expect(allowed).toBe(false)
        expect(captured).toHaveLength(before)
    })

    test('validate 없이 호출한 checkRateLimit 은 기존처럼 카운트 쿼리를 실행한다', async () => {
        const captured: CapturedQuery[] = []
        const service = createWeatherApiKeyService({ db: createCapturingDb(captured, [[3]]) })

        const allowed = await service.checkRateLimit(1, 100)

        expect(allowed).toBe(true)
        expect(captured).toHaveLength(1)
        expect(captured[0].sql).toContain('COUNT(*)')
    })
})
