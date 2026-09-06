import { describe, expect, test } from 'bun:test'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'
import { composeResume } from '../../compose/resume'
import * as schema from '../../db/schema'

const adminWebResume = {
    id: 7,
    userId: 'admin-user',
    type: 'web',
    title: '웹 이력서',
    data: { profile: { firstName: 'Hyunseok' } },
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createRecorderDb = (rows: unknown[]) => {
    const record: { joinedTable: unknown; condition: SQL | null; orderBy: SQL[] } = { joinedTable: null, condition: null, orderBy: [] }

    const chain = {
        from: () => chain,
        leftJoin: (table: unknown) => {
            record.joinedTable = table
            return chain
        },
        where: (condition: SQL) => {
            record.condition = condition
            return chain
        },
        orderBy: (...expressions: SQL[]) => {
            record.orderBy = expressions
            return chain
        },
        limit: () => Promise.resolve(rows),
    }

    return { db: { select: () => chain }, record }
}

describe('composeResume', () => {
    test('getLatestResumeByTypePreferringAdmin는 user를 조인해 admin 소유 행을 우선 정렬한다', async () => {
        const { db, record } = createRecorderDb([adminWebResume])
        const { resumeService } = composeResume({ db } as never)

        const resume = await resumeService.getPublicWebResume()

        expect(resume?.id).toBe(adminWebResume.id)
        expect(record.joinedTable).toBe(schema.user)

        const dialect = new MySqlDialect()
        const where = dialect.sqlToQuery(record.condition as SQL)
        expect(where.params).toContain('web')

        const priority = dialect.sqlToQuery(record.orderBy[0])
        expect(priority.sql).toContain('`role`')
        expect(priority.params).toContain('admin')
    })

    test('admin 행이 없어도 최신 web 행을 반환한다', async () => {
        const nonAdminWebResume = { ...adminWebResume, id: 9, userId: 'normal-user' }
        const { db, record } = createRecorderDb([nonAdminWebResume])
        const { resumeService } = composeResume({ db } as never)

        const resume = await resumeService.getPublicWebResume()

        expect(resume?.id).toBe(nonAdminWebResume.id)
        expect(new MySqlDialect().sqlToQuery(record.condition as SQL).params).not.toContain('admin')
    })

    test('updateWebResume는 조회된 행 id로 갱신한다', async () => {
        const { db } = createRecorderDb([adminWebResume])
        const updates: Array<{ id: unknown }> = []
        const dbWithUpdate = {
            ...db,
            update: () => ({
                set: () => ({
                    where: (condition: SQL) => {
                        updates.push({ id: new MySqlDialect().sqlToQuery(condition).params[0] })
                        return Promise.resolve()
                    },
                }),
            }),
        }

        const { resumeService } = composeResume({ db: dbWithUpdate } as never)
        const result = await resumeService.updateWebResume({ profile: { firstName: 'Hyunseok' } } as never)

        expect(result.success).toBe(true)
        expect(updates).toHaveLength(1)
        expect(updates[0].id).toBe(adminWebResume.id)
    })
})

describe('composeResume updateResume', () => {
    const createUpdateRecorderDb = (rows: unknown[]) => {
        const setValues: Array<Record<string, unknown>> = []
        const { db } = createRecorderDb(rows)
        const dbWithUpdate = {
            ...db,
            update: () => ({
                set: (values: Record<string, unknown>) => {
                    setValues.push(values)
                    return { where: () => Promise.resolve() }
                },
            }),
        }
        return { db: dbWithUpdate, setValues }
    }

    test('갱신할 값이 없으면 UPDATE를 실행하지 않고 성공한다', async () => {
        const { db, setValues } = createUpdateRecorderDb([adminWebResume])
        const { resumeService } = composeResume({ db } as never)

        const result = await resumeService.update(adminWebResume.id, adminWebResume.userId, {})

        expect(result.success).toBe(true)
        expect(setValues).toHaveLength(0)
    })

    test('갱신할 값이 있으면 UPDATE를 실행한다', async () => {
        const { db, setValues } = createUpdateRecorderDb([adminWebResume])
        const { resumeService } = composeResume({ db } as never)

        const result = await resumeService.update(adminWebResume.id, adminWebResume.userId, { title: '새 제목' })

        expect(result.success).toBe(true)
        expect(setValues).toEqual([{ title: '새 제목' }])
    })
})
