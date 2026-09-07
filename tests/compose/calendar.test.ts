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

const createEventRow = (uid: string, summary = 'Event') => ({
    uid,
    summary,
    description: null,
    location: null,
    dtstart: new Date('2024-01-01T10:00:00Z'),
    dtend: new Date('2024-01-01T11:00:00Z'),
    isAllDay: false,
    rrule: null,
    exdate: null,
    status: null,
    transp: null,
    priority: null,
    categories: null,
    color: null,
    groupId: null,
    sequence: 0,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
})

const createSelectCountingDb = (rows: unknown[]) => {
    let selectCalls = 0
    const db = {
        select: () => {
            selectCalls += 1
            return { from: () => ({ where: async () => rows }) }
        },
    }
    return { db, selectCalls: () => selectCalls }
}

describe('composeCalendar getEventByUid (P-18)', () => {
    test('도메인 접미사 유무를 or() 단일 조회로 해결한다', async () => {
        const fake = createSelectCountingDb([createEventRow('uid-1@b-calendar')])
        const { calendarService } = createServices(fake.db)

        const event = await calendarService.getEventByUid('user-1', 'uid-1')

        expect(fake.selectCalls()).toBe(1)
        expect(event?.uid).toBe('uid-1@b-calendar')
    })

    test('정확히 일치하는 uid 를 도메인 변형보다 우선한다', async () => {
        const fake = createSelectCountingDb([createEventRow('uid-1@b-calendar', 'domain'), createEventRow('uid-1', 'exact')])
        const { calendarService } = createServices(fake.db)

        const event = await calendarService.getEventByUid('user-1', 'uid-1')

        expect(event?.summary).toBe('exact')
    })

    test('일치하는 행이 없으면 null 을 반환한다', async () => {
        const fake = createSelectCountingDb([])
        const { calendarService } = createServices(fake.db)

        expect(await calendarService.getEventByUid('user-1', 'uid-1')).toBeNull()
    })
})

describe('composeCalendar getEventsByUids (P-18)', () => {
    test('여러 uid 를 단일 조회로 가져온다', async () => {
        const fake = createSelectCountingDb([createEventRow('uid-1'), createEventRow('uid-2@b-calendar')])
        const { calendarService } = createServices(fake.db)

        const events = await calendarService.getEventsByUids('user-1', ['uid-1', 'uid-2', 'uid-3'])

        expect(fake.selectCalls()).toBe(1)
        expect(events.get('uid-1')?.uid).toBe('uid-1')
        expect(events.get('uid-2')?.uid).toBe('uid-2@b-calendar')
        expect(events.get('uid-3')).toBeUndefined()
    })

    test('uid 가 없으면 조회하지 않는다', async () => {
        const fake = createSelectCountingDb([])
        const { calendarService } = createServices(fake.db)

        const events = await calendarService.getEventsByUids('user-1', [])

        expect(fake.selectCalls()).toBe(0)
        expect(events.size).toBe(0)
    })
})

describe('composeCalendar insertSubscription', () => {
    test('select 없이 onDuplicateKeyUpdate 로 upsert 한다', async () => {
        const calls: { values: unknown; set: unknown }[] = []
        let selectCalls = 0
        const db = {
            select: () => {
                selectCalls += 1
                return { from: () => ({ where: async () => [] }) }
            },
            insert: () => ({
                values: (values: unknown) => ({
                    onDuplicateKeyUpdate: async (config: { set: unknown }) => {
                        calls.push({ values, set: config.set })
                    },
                }),
            }),
            transaction: async () => {
                throw new Error('transaction should not be used')
            },
        }
        const { calendarService } = createServices(db)

        const subscription = await calendarService.createSubscription('user-1', 'My Calendar')

        expect(calls).toHaveLength(1)
        expect((calls[0].values as { userId: string }).userId).toBe('user-1')
        expect((calls[0].set as { userId: string }).userId).toBe('user-1')
        expect(subscription.name).toBe('My Calendar')
        expect(selectCalls).toBe(2)
    })
})
