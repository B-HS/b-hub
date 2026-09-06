import { describe, expect, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { createAdminDb, likeContains } from '../../../page/admin/db'
import type { Database } from '../../../db'

const createRecordingDb = (conditions: unknown[]) => {
    const builder = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: (condition: unknown) => {
            conditions.push(condition)
            return builder
        },
        orderBy: () => builder,
        limit: () => builder,
        offset: () => builder,
        then: (resolve: (rows: unknown[]) => unknown) => resolve([{ c: 0 }]),
    }
    return { select: () => builder } as unknown as Database
}

const paramsOf = (condition: unknown) => new MySqlDialect().sqlToQuery(condition as SQL).params

describe('likeContains', () => {
    test('LIKE 와일드카드를 이스케이프한 뒤 부분일치 패턴으로 감싼다', () => {
        expect(likeContains('100%')).toBe('%100\\%%')
        expect(likeContains('a_b')).toBe('%a\\_b%')
        expect(likeContains('a\\b')).toBe('%a\\\\b%')
        expect(likeContains('hyun')).toBe('%hyun%')
    })
})

describe('adminDb 검색어 바인딩', () => {
    test('listUsers 의 q 는 이스케이프된 패턴으로 바인딩된다', async () => {
        const conditions: unknown[] = []
        await createAdminDb(createRecordingDb(conditions)).listUsers({ page: 1, size: 20, q: '100%_x' })
        expect(conditions.length).toBeGreaterThan(0)
        expect(paramsOf(conditions[0])).toEqual(['%100\\%\\_x%', '%100\\%\\_x%'])
    })

    test('listSessions 의 q 도 이스케이프된 패턴으로 바인딩된다', async () => {
        const conditions: unknown[] = []
        await createAdminDb(createRecordingDb(conditions)).listSessions({ page: 1, size: 20, q: '50%' })
        expect(paramsOf(conditions[0])).toEqual(['%50\\%%'])
    })

    test('검색어가 없으면 where 조건을 만들지 않는다', async () => {
        const conditions: unknown[] = []
        await createAdminDb(createRecordingDb(conditions)).listSessions({ page: 1, size: 20 })
        expect(conditions.every((condition) => condition === undefined)).toBe(true)
    })
})
