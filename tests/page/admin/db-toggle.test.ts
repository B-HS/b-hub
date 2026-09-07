import { describe, expect, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { createAdminDb, type AdminDb } from '../../../page/admin/db'
import type { Database } from '../../../db'

type RecordedCall = { kind: 'select' | 'update'; set?: Record<string, unknown>; where?: unknown }

const MISSING_ID = 9999
const EXISTING_ID = 12

const createToggleDb = (calls: RecordedCall[], affectedRows: number) => {
    const selectQuery: Record<string, unknown> = { then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) }
    for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit', 'offset']) selectQuery[method] = () => selectQuery
    return {
        select: () => {
            calls.push({ kind: 'select' })
            return selectQuery
        },
        update: () => ({
            set: (values: Record<string, unknown>) => ({
                where: (condition: unknown) => {
                    calls.push({ kind: 'update', set: values, where: condition })
                    return Promise.resolve([{ affectedRows }])
                },
            }),
        }),
    } as unknown as Database
}

const dialect = new MySqlDialect()
const renderSql = (value: unknown) => dialect.sqlToQuery(value as SQL).sql
const paramsOf = (value: unknown) => dialect.sqlToQuery(value as SQL).params

type ToggleCase = {
    name: string
    field: string
    setKeys: string[]
    flipSql: string
    run: (adminDb: AdminDb, id: number) => Promise<void>
}

const TOGGLES: ToggleCase[] = [
    {
        name: 'togglePostFlag(isPublished)',
        field: 'isPublished',
        setKeys: ['isPublished', 'updatedAt'],
        flipSql: 'not `posts`.`isPublished`',
        run: (adminDb, id) => adminDb.togglePostFlag(id, 'isPublished'),
    },
    {
        name: 'togglePostFlag(isHide)',
        field: 'isHide',
        setKeys: ['isHide', 'updatedAt'],
        flipSql: 'not `posts`.`isHide`',
        run: (adminDb, id) => adminDb.togglePostFlag(id, 'isHide'),
    },
    {
        name: 'togglePostFlag(isNotice)',
        field: 'isNotice',
        setKeys: ['isNotice', 'updatedAt'],
        flipSql: 'not `posts`.`isNotice`',
        run: (adminDb, id) => adminDb.togglePostFlag(id, 'isNotice'),
    },
    {
        name: 'togglePostFlag(isComment)',
        field: 'isComment',
        setKeys: ['isComment', 'updatedAt'],
        flipSql: 'not `posts`.`isComment`',
        run: (adminDb, id) => adminDb.togglePostFlag(id, 'isComment'),
    },
    {
        name: 'toggleCommentHide',
        field: 'isHide',
        setKeys: ['isHide', 'updatedAt'],
        flipSql: 'not `comments`.`isHide`',
        run: (adminDb, id) => adminDb.toggleCommentHide(id),
    },
    {
        name: 'toggleCategoryHide',
        field: 'isHide',
        setKeys: ['isHide'],
        flipSql: 'not `categories`.`isHide`',
        run: (adminDb, id) => adminDb.toggleCategoryHide(id),
    },
    {
        name: 'toggleMailAccount',
        field: 'isActive',
        setKeys: ['isActive'],
        flipSql: 'not `mail_accounts`.`is_active`',
        run: (adminDb, id) => adminDb.toggleMailAccount(id),
    },
    {
        name: 'toggleSpotifyWidgetToken',
        field: 'isActive',
        setKeys: ['isActive'],
        flipSql: 'not `spotify_widget_tokens`.`is_active`',
        run: (adminDb, id) => adminDb.toggleSpotifyWidgetToken(id),
    },
    {
        name: 'toggleResumeVisibility',
        field: 'isPublic',
        setKeys: ['isPublic'],
        flipSql: 'not `resumes`.`is_public`',
        run: (adminDb, id) => adminDb.toggleResumeVisibility(id),
    },
]

describe('adminDb 토글 단일 UPDATE (P-22)', () => {
    for (const { name, field, setKeys, flipSql, run } of TOGGLES) {
        test(`${name} 는 select 없이 UPDATE 한 번으로 ${field} 을 뒤집는다`, async () => {
            const calls: RecordedCall[] = []
            await run(createAdminDb(createToggleDb(calls, 1)), EXISTING_ID)
            expect(calls.length).toBe(1)
            expect(calls[0].kind).toBe('update')
            expect(renderSql(calls[0].set?.[field])).toBe(flipSql)
            expect(Object.keys(calls[0].set ?? {})).toEqual(setKeys)
            expect(paramsOf(calls[0].where)).toEqual([EXISTING_ID])
        })

        test(`${name} 는 존재하지 않는 id 에서도 예외 없이 끝나고 행을 바꾸지 않는다`, async () => {
            const calls: RecordedCall[] = []
            const result = await run(createAdminDb(createToggleDb(calls, 0)), MISSING_ID)
            expect(result).toBeUndefined()
            expect(calls.length).toBe(1)
            expect(paramsOf(calls[0].where)).toEqual([MISSING_ID])
        })
    }

    test('updatedAt 을 갱신하는 토글은 Date 를 직접 넣는다', async () => {
        const calls: RecordedCall[] = []
        const before = Date.now()
        await createAdminDb(createToggleDb(calls, 1)).togglePostFlag(EXISTING_ID, 'isPublished')
        const updatedAt = calls[0].set?.updatedAt
        expect(updatedAt).toBeInstanceOf(Date)
        expect((updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
    })
})
