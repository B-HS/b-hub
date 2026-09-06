import { describe, expect, test } from 'bun:test'
import { composeCalendar } from '../../compose/calendar'

type Operation = { kind: 'insert' | 'delete' | 'update'; payload?: unknown }

const DELETE_FAILURE_MESSAGE = 'delete failed'

const createFakeDb = (options: { existingUid?: string; failOnDelete?: boolean } = {}) => {
    const operations: Operation[] = []
    let transactionCalls = 0
    let committed = false

    const tx = {
        insert: () => ({
            values: async (values: unknown) => {
                operations.push({ kind: 'insert', payload: values })
            },
        }),
        delete: () => ({
            where: async () => {
                if (options.failOnDelete) return Promise.reject(new Error(DELETE_FAILURE_MESSAGE))
                operations.push({ kind: 'delete' })
            },
        }),
        update: () => ({
            set: (values: unknown) => ({
                where: async () => {
                    operations.push({ kind: 'update', payload: values })
                },
            }),
        }),
    }

    const db = {
        select: () => ({
            from: () => ({
                where: async () => (options.existingUid ? [{ uid: options.existingUid }] : []),
            }),
        }),
        transaction: async (fn: (t: typeof tx) => Promise<void>) => {
            transactionCalls += 1
            await fn(tx)
            committed = true
        },
    }

    return { db, operations, stats: () => ({ transactionCalls, committed }) }
}

const createServices = (db: unknown) => composeCalendar({ db: db as never, env: {} as never })

describe('composeCalendar deleteEventWithTombstone', () => {
    test('이벤트가 없으면 트랜잭션을 열지 않는다', async () => {
        const fake = createFakeDb()
        const { calendarService } = createServices(fake.db)

        await calendarService.deleteEvent('user-1', 'uid-1@b-calendar')

        expect(fake.stats().transactionCalls).toBe(0)
    })

    test('tombstone 삽입·이벤트 삭제·ctag 갱신을 하나의 트랜잭션에서 처리한다', async () => {
        const fake = createFakeDb({ existingUid: 'uid-1@b-calendar' })
        const { calendarService } = createServices(fake.db)

        await calendarService.deleteEvent('user-1', 'uid-1@b-calendar')

        expect(fake.stats().transactionCalls).toBe(1)
        expect(fake.stats().committed).toBe(true)
        expect(fake.operations.map((operation) => operation.kind)).toEqual(['insert', 'delete', 'update'])

        const tombstone = fake.operations[0].payload as { userId: string; uid: string; syncToken: string }
        const ctag = fake.operations[2].payload as { ctag: string }
        expect(tombstone.userId).toBe('user-1')
        expect(tombstone.uid).toBe('uid-1@b-calendar')
        expect(ctag.ctag).toBe(tombstone.syncToken)
    })

    test('이벤트 삭제가 실패하면 트랜잭션이 커밋되지 않는다', async () => {
        const fake = createFakeDb({ existingUid: 'uid-1@b-calendar', failOnDelete: true })
        const { calendarService } = createServices(fake.db)

        await expect(calendarService.deleteEvent('user-1', 'uid-1@b-calendar')).rejects.toThrow(DELETE_FAILURE_MESSAGE)
        expect(fake.stats().committed).toBe(false)
    })
})
