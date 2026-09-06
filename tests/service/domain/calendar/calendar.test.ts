import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createCalendarService } from '../../../../service/domain/calendar/calendar'
import type { CalendarServiceDb } from '../../../../service/domain/calendar/calendar'

const createMockDb = (): CalendarServiceDb => ({
    getEventsByMonthRange: mock(() => Promise.resolve([])),
    getEventsByDateRange: mock(() => Promise.resolve([])),
    getAllEvents: mock(() => Promise.resolve([])),
    getEventByUid: mock(() => Promise.resolve(null)),
    getEventByUidWithDomain: mock(() => Promise.resolve(null)),
    insertEvent: mock(() => Promise.resolve()),
    updateEvent: mock(() => Promise.resolve()),
    deleteEventWithTombstone: mock(() => Promise.resolve()),
    getGroupsByUser: mock(() => Promise.resolve([])),
    getGroupById: mock(() => Promise.resolve(null)),
    insertGroup: mock(() => Promise.resolve()),
    updateGroup: mock(() => Promise.resolve()),
    deleteGroup: mock(() => Promise.resolve()),
    countEventsByGroup: mock(() => Promise.resolve(0)),
    getSubscription: mock(() => Promise.resolve(null)),
    getSubscriptionByToken: mock(() => Promise.resolve(null)),
    getSubscriptionByIcsToken: mock(() => Promise.resolve(null)),
    insertSubscription: mock(() => Promise.resolve()),
    updateSubscription: mock(() => Promise.resolve()),
    updateSubscriptionToken: mock(() => Promise.resolve()),
    updateSubscriptionIcsToken: mock(() => Promise.resolve()),
    updateSubscriptionLastAccessed: mock(() => Promise.resolve()),
    incrementCtag: mock(() => Promise.resolve()),
    getUserTimezone: mock(() => Promise.resolve(null)),
    updateUserTimezone: mock(() => Promise.resolve()),
})

type CalendarEventRow = Awaited<ReturnType<CalendarServiceDb['getAllEvents']>>[number]

const createEventRow = (overrides: Partial<CalendarEventRow> = {}): CalendarEventRow => ({
    uid: 'uid-base@b-calendar',
    summary: 'Base Event',
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
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
})

const existingSubscription = {
    id: 'sub-1',
    userId: 'user-123',
    token: 'existing-token',
    icsToken: 'existing-ics-token',
    name: 'My Calendar',
    isActive: true,
    ctag: '0',
    lastAccessedAt: null,
}

let mockDb: CalendarServiceDb

describe('CalendarService', () => {
    beforeEach(() => {
        mockDb = createMockDb()
    })

    describe('getAllEvents', () => {
        test('이벤트가 없으면 빈 배열을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const events = await service.getAllEvents('user-123')

            expect(events).toEqual([])
        })

        test('매핑된 이벤트를 반환한다', async () => {
            const mockRow = {
                uid: 'uid-123@b-calendar',
                summary: 'Test Event',
                description: 'Test Description',
                location: 'Test Location',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                rrule: null,
                exdate: null,
                status: 'CONFIRMED',
                transp: 'OPAQUE',
                priority: null,
                categories: null,
                color: null,
                groupId: null,
                sequence: 0,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            }
            ;(mockDb.getAllEvents as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getAllEvents('user-123')

            expect(events).toHaveLength(1)
            expect(events[0].uid).toBe('uid-123@b-calendar')
            expect(events[0].summary).toBe('Test Event')
            expect(events[0].description).toBe('Test Description')
            expect(events[0].location).toBe('Test Location')
        })
    })

    describe('getEventByUid', () => {
        test('이벤트가 없으면 null을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const event = await service.getEventByUid('user-123', 'non-existent')

            expect(event).toBeNull()
        })

        test('이벤트를 찾으면 반환한다', async () => {
            const mockRow = {
                uid: 'uid-123@b-calendar',
                summary: 'Test Event',
                description: null,
                location: null,
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
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
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            }
            ;(mockDb.getEventByUid as ReturnType<typeof mock>).mockResolvedValue(mockRow)
            const service = createCalendarService({ db: mockDb })

            const event = await service.getEventByUid('user-123', 'uid-123@b-calendar')

            expect(event).not.toBeNull()
            expect(event?.uid).toBe('uid-123@b-calendar')
        })

        test('도메인 접미사 없이도 찾는다', async () => {
            const mockRow = {
                uid: 'uid-123@b-calendar',
                summary: 'Test Event',
                description: null,
                location: null,
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
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
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            }
            ;(mockDb.getEventByUid as ReturnType<typeof mock>).mockResolvedValue(null)
            ;(mockDb.getEventByUidWithDomain as ReturnType<typeof mock>).mockResolvedValue(mockRow)
            const service = createCalendarService({ db: mockDb })

            const event = await service.getEventByUid('user-123', 'uid-123')

            expect(event).not.toBeNull()
            expect(event?.uid).toBe('uid-123@b-calendar')
        })
    })

    describe('createEvent', () => {
        test('uid에 @b-calendar 접미사를 생성한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const event = await service.createEvent('user-123', {
                summary: 'New Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            })

            expect(event.uid).toContain('@b-calendar')
            expect(event.summary).toBe('New Event')
            expect(event.created).toBeDefined()
            expect(event.lastModified).toBeDefined()
        })

        test('rrule을 처리한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const event = await service.createEvent('user-123', {
                summary: 'Recurring Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                rrule: { freq: 'WEEKLY', interval: 1 },
            })

            expect(event.rrule?.freq).toBe('WEEKLY')
        })

        test('incrementCtag을 호출한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.createEvent('user-123', {
                summary: 'Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            })

            expect(mockDb.incrementCtag).toHaveBeenCalledWith('user-123')
        })

        test('description이 null이면 null로 전달한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.createEvent('user-123', {
                summary: 'Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                description: undefined,
            })

            const insertCall = (mockDb.insertEvent as ReturnType<typeof mock>).mock.calls[0]
            expect(insertCall[0].description).toBeNull()
        })

        test('categories 빈 배열이면 null로 전달한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.createEvent('user-123', {
                summary: 'Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                categories: [],
            })

            const insertCall = (mockDb.insertEvent as ReturnType<typeof mock>).mock.calls[0]
            expect(insertCall[0].categories).toBeNull()
        })

        test('groupId를 전달한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.createEvent('user-123', {
                summary: 'Group Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                groupId: 'group-1',
            })

            const insertCall = (mockDb.insertEvent as ReturnType<typeof mock>).mock.calls[0]
            expect(insertCall[0].groupId).toBe('group-1')
        })

        test('groupId가 undefined이면 null로 전달한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.createEvent('user-123', {
                summary: 'No Group',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            })

            const insertCall = (mockDb.insertEvent as ReturnType<typeof mock>).mock.calls[0]
            expect(insertCall[0].groupId).toBeNull()
        })
    })

    describe('deleteEvent', () => {
        test('insertDeletedEvent, deleteEventByUid, incrementCtag을 호출한다', async () => {
            const mockRow = {
                uid: 'uid-123@b-calendar',
                summary: 'Test',
                description: null,
                location: null,
                dtstart: new Date(),
                dtend: new Date(),
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
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getEventByUid as ReturnType<typeof mock>).mockResolvedValue(mockRow)
            const service = createCalendarService({ db: mockDb })

            await service.deleteEvent('user-123', 'uid-123@b-calendar')

            expect(mockDb.deleteEventWithTombstone).toHaveBeenCalledTimes(1)
            const [payload] = (mockDb.deleteEventWithTombstone as ReturnType<typeof mock>).mock.calls[0] as unknown as [
                { userId: string; uid: string; deletedEventId: string; syncToken: string },
            ]
            expect(payload.userId).toBe('user-123')
            expect(payload.uid).toBe('uid-123@b-calendar')
            expect(payload.deletedEventId).toBeTruthy()
            expect(payload.syncToken).toBeTruthy()
        })

        test('삭제는 tombstone·삭제·ctag 를 개별 호출로 나누지 않는다 (D-21)', async () => {
            const mockRow = createEventRow({ uid: 'uid-123@b-calendar' })
            ;(mockDb.getEventByUid as ReturnType<typeof mock>).mockResolvedValue(mockRow)
            const service = createCalendarService({ db: mockDb })

            await service.deleteEvent('user-123', 'uid-123@b-calendar')

            expect(mockDb.incrementCtag).not.toHaveBeenCalled()
        })

        test('이벤트가 없으면 아무 작업도 하지 않는다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.deleteEvent('user-123', 'non-existent')

            expect(mockDb.deleteEventWithTombstone).not.toHaveBeenCalled()
        })
    })

    describe('getEventsByMonth', () => {
        test('빈 배열을 반환한다 (이벤트 없음)', async () => {
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByMonth('user-123', 2024, 0)

            expect(events).toEqual([])
            expect(mockDb.getEventsByMonthRange).toHaveBeenCalled()
        })

        test('반복 이벤트를 포함한다', async () => {
            const mockRow = {
                uid: 'uid-recurring@b-calendar',
                summary: 'Weekly Meeting',
                description: null,
                location: null,
                dtstart: new Date('2024-01-01T10:00:00Z'),
                dtend: new Date('2024-01-01T11:00:00Z'),
                isAllDay: false,
                rrule: { freq: 'WEEKLY' as const, interval: 1 },
                exdate: null,
                status: null,
                transp: null,
                priority: null,
                categories: null,
                color: null,
                groupId: null,
                sequence: 0,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            }
            ;(mockDb.getEventsByMonthRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByMonth('user-123', 2024, 0)

            expect(events).toHaveLength(5)
            expect(events.every((e) => e.uid === 'uid-recurring@b-calendar')).toBe(true)
            expect(events[0].rrule?.freq).toBe('WEEKLY')
            expect(new Set(events.map((e) => e.dtstart.toISOString())).size).toBe(5)
        })

        test('반복 발생이 범위 밖이면 제외한다', async () => {
            const mockRow = {
                uid: 'uid-past@b-calendar',
                summary: 'Past Recurring',
                description: null,
                location: null,
                dtstart: new Date('2023-06-01T10:00:00Z'),
                dtend: new Date('2023-06-01T11:00:00Z'),
                isAllDay: false,
                rrule: { freq: 'YEARLY' as const, count: 1 },
                exdate: null,
                status: null,
                transp: null,
                priority: null,
                categories: null,
                color: null,
                groupId: null,
                sequence: 0,
                createdAt: new Date('2023-06-01'),
                updatedAt: new Date('2023-06-01'),
            }
            ;(mockDb.getEventsByMonthRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByMonth('user-123', 2024, 0)

            const found = events.find((e) => e.uid === 'uid-past@b-calendar')
            expect(found).toBeUndefined()
        })
    })

    describe('updateEvent', () => {
        test('sequence를 자동으로 1 증가시킨다', async () => {
            const service = createCalendarService({ db: mockDb })

            const eventData = {
                uid: 'uid-123@b-calendar',
                summary: 'Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                sequence: 2,
            }

            const result = await service.updateEvent('user-123', eventData)

            expect(result.sequence).toBe(3)
        })

        test('rrule until의 Date를 ISO string으로 변환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const untilDate = new Date('2024-12-31T23:59:59Z')
            const eventData = {
                uid: 'uid-123@b-calendar',
                summary: 'Recurring',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                rrule: { freq: 'WEEKLY' as const, until: untilDate },
            }

            await service.updateEvent('user-123', eventData)

            const updateCall = (mockDb.updateEvent as ReturnType<typeof mock>).mock.calls[0]
            expect(updateCall[2].rrule.until).toBe(untilDate.toISOString())
        })
    })

    describe('upsertEventByUid', () => {
        test('기존 이벤트가 있으면 업데이트한다', async () => {
            const mockRow = {
                uid: 'uid-123@b-calendar',
                summary: 'Existing Event',
                description: null,
                location: null,
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
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
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            }
            ;(mockDb.getEventByUid as ReturnType<typeof mock>).mockResolvedValue(mockRow)
            const service = createCalendarService({ db: mockDb })

            const result = await service.upsertEventByUid('user-123', 'uid-123@b-calendar', {
                summary: 'Updated Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            })

            expect(result.created).toBe(false)
            expect(result.event.summary).toBe('Updated Event')
            expect(mockDb.updateEvent).toHaveBeenCalled()
        })

        test('기존 이벤트가 없으면 생성한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const result = await service.upsertEventByUid('user-123', 'new-uid@b-calendar', {
                summary: 'New Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            })

            expect(result.created).toBe(true)
            expect(result.event.uid).toBe('new-uid@b-calendar')
            expect(mockDb.insertEvent).toHaveBeenCalled()
        })
    })

    describe('getEventEtag', () => {
        test('lastModified가 undefined이면 현재시간 기반 etag을 생성한다', () => {
            const service = createCalendarService({ db: mockDb })
            const event = {
                uid: 'uid-123@b-calendar',
                summary: 'Test',
                dtstart: new Date(),
                dtend: new Date(),
                isAllDay: false,
            }

            const etag = service.getEventEtag(event)

            expect(etag).toBeDefined()
            expect(typeof etag).toBe('string')
            expect(etag.length).toBeGreaterThan(0)
        })

        test('etag 형식이 "timestamp-uid" 패턴이다', () => {
            const service = createCalendarService({ db: mockDb })
            const event = {
                uid: 'uid-123@b-calendar',
                summary: 'Test',
                dtstart: new Date(),
                dtend: new Date(),
                isAllDay: false,
                lastModified: new Date('2024-01-01T00:00:00Z'),
            }

            const etag = service.getEventEtag(event)

            expect(etag).toMatch(/^[a-z0-9]+-uid-123@$/)
        })
    })

    describe('regenerateSubscriptionToken', () => {
        test('새 토큰을 반환한다', async () => {
            ;(mockDb.getSubscription as ReturnType<typeof mock>).mockResolvedValue(existingSubscription)
            const service = createCalendarService({ db: mockDb })

            const token = await service.regenerateSubscriptionToken('user-123')

            expect(typeof token).toBe('string')
            expect(token.length).toBeGreaterThan(0)
            expect(mockDb.updateSubscriptionToken).toHaveBeenCalledWith('user-123', token)
        })

        test('구독이 없으면 CALENDAR_SUBSCRIPTION_NOT_FOUND 를 던지고 토큰을 갱신하지 않는다', async () => {
            const service = createCalendarService({ db: mockDb })

            await expect(service.regenerateSubscriptionToken('user-123')).rejects.toMatchObject({
                code: 'CALENDAR_SUBSCRIPTION_NOT_FOUND',
                statusCode: 404,
            })
            expect(mockDb.updateSubscriptionToken).not.toHaveBeenCalled()
        })
    })

    describe('regenerateIcsToken', () => {
        test('새 ICS 토큰을 반환한다', async () => {
            ;(mockDb.getSubscription as ReturnType<typeof mock>).mockResolvedValue(existingSubscription)
            const service = createCalendarService({ db: mockDb })

            const token = await service.regenerateIcsToken('user-123')

            expect(typeof token).toBe('string')
            expect(token.length).toBeGreaterThan(0)
            expect(mockDb.updateSubscriptionIcsToken).toHaveBeenCalledWith('user-123', token)
        })

        test('구독이 없으면 CALENDAR_SUBSCRIPTION_NOT_FOUND 를 던지고 ICS 토큰을 갱신하지 않는다', async () => {
            const service = createCalendarService({ db: mockDb })

            await expect(service.regenerateIcsToken('user-123')).rejects.toMatchObject({
                code: 'CALENDAR_SUBSCRIPTION_NOT_FOUND',
                statusCode: 404,
            })
            expect(mockDb.updateSubscriptionIcsToken).not.toHaveBeenCalled()
        })
    })

    describe('updateUserTimezone', () => {
        test('타임존을 업데이트한다', async () => {
            const service = createCalendarService({ db: mockDb })

            await service.updateUserTimezone('user-123', 'America/New_York')

            expect(mockDb.updateUserTimezone).toHaveBeenCalledWith('user-123', 'America/New_York')
        })
    })

    describe('getSubscriptionByIcsToken', () => {
        test('ICS 토큰으로 구독을 반환한다', async () => {
            const sub = {
                id: 'sub-1',
                userId: 'user-123',
                token: 'token-123',
                icsToken: 'ics-token-123',
                name: 'My Calendar',
                isActive: true,
                ctag: 'abc',
                lastAccessedAt: null,
            }
            ;(mockDb.getSubscriptionByIcsToken as ReturnType<typeof mock>).mockResolvedValue(sub)
            const service = createCalendarService({ db: mockDb })

            const result = await service.getSubscriptionByIcsToken('ics-token-123')

            expect(result).not.toBeNull()
            expect(result?.icsToken).toBe('ics-token-123')
        })

        test('토큰이 없으면 null을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const result = await service.getSubscriptionByIcsToken('non-existent')

            expect(result).toBeNull()
        })
    })

    describe('getSubscription', () => {
        test('구독이 없으면 null을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const sub = await service.getSubscription('user-123')

            expect(sub).toBeNull()
        })
    })

    describe('createSubscription', () => {
        test('기존 구독이 있으면 기존 것을 반환한다', async () => {
            const existingSub = {
                id: 'sub-1',
                userId: 'user-123',
                token: 'existing-token',
                icsToken: 'existing-ics-token',
                name: 'My Calendar',
                isActive: true,
                ctag: '0',
                lastAccessedAt: null,
            }
            ;(mockDb.getSubscription as ReturnType<typeof mock>).mockResolvedValue(existingSub)
            const service = createCalendarService({ db: mockDb })

            const sub = await service.createSubscription('user-123')

            expect(sub.token).toBe('existing-token')
            expect(mockDb.insertSubscription).not.toHaveBeenCalled()
        })

        test('구독이 없으면 새로 생성한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const sub = await service.createSubscription('user-123', 'Test Calendar')

            expect(sub.name).toBe('Test Calendar')
            expect(sub.isActive).toBe(true)
            expect(sub.ctag).toBe('0')
            expect(mockDb.insertSubscription).toHaveBeenCalled()
        })
    })

    describe('getSubscriptionByToken', () => {
        test('토큰으로 구독을 찾으면 lastAccessedAt을 업데이트한다', async () => {
            const sub = {
                id: 'sub-1',
                userId: 'user-123',
                token: 'token-123',
                icsToken: 'ics-token-123',
                name: 'My Calendar',
                isActive: true,
                ctag: 'abc',
                lastAccessedAt: null,
            }
            ;(mockDb.getSubscriptionByToken as ReturnType<typeof mock>).mockResolvedValue(sub)
            const service = createCalendarService({ db: mockDb })

            const result = await service.getSubscriptionByToken('token-123')

            expect(result).not.toBeNull()
            expect(mockDb.updateSubscriptionLastAccessed).toHaveBeenCalledWith('sub-1')
        })

        test('ctag을 변경하지 않는다 (Bug #6 수정)', async () => {
            const sub = {
                id: 'sub-1',
                userId: 'user-123',
                token: 'token-123',
                icsToken: 'ics-token-123',
                name: 'My Calendar',
                isActive: true,
                ctag: 'original-ctag',
                lastAccessedAt: null,
            }
            ;(mockDb.getSubscriptionByToken as ReturnType<typeof mock>).mockResolvedValue(sub)
            const service = createCalendarService({ db: mockDb })

            const result = await service.getSubscriptionByToken('token-123')

            expect(result?.ctag).toBe('original-ctag')
            expect(mockDb.incrementCtag).not.toHaveBeenCalled()
        })
    })

    describe('getUserTimezone', () => {
        test('타임존이 null이면 기본값 Asia/Seoul을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const tz = await service.getUserTimezone('user-123')

            expect(tz).toBe('Asia/Seoul')
        })

        test('사용자 타임존을 반환한다', async () => {
            ;(mockDb.getUserTimezone as ReturnType<typeof mock>).mockResolvedValue('America/New_York')
            const service = createCalendarService({ db: mockDb })

            const tz = await service.getUserTimezone('user-123')

            expect(tz).toBe('America/New_York')
        })
    })

    describe('getEventEtag', () => {
        test('etag을 생성한다', () => {
            const service = createCalendarService({ db: mockDb })
            const event = {
                uid: 'uid-123@b-calendar',
                summary: 'Test',
                dtstart: new Date(),
                dtend: new Date(),
                isAllDay: false,
                lastModified: new Date('2024-01-01T00:00:00Z'),
            }

            const etag = service.getEventEtag(event)

            expect(etag).toContain('uid-123@')
        })
    })

    describe('getEventsByDateRange', () => {
        test('날짜 범위의 이벤트를 반환한다', async () => {
            const mockRow = {
                uid: 'uid-range@b-calendar',
                summary: 'Range Event',
                description: null,
                location: null,
                dtstart: new Date('2024-03-15T10:00:00Z'),
                dtend: new Date('2024-03-15T11:00:00Z'),
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
                createdAt: new Date('2024-03-01'),
                updatedAt: new Date('2024-03-01'),
            }
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const startDate = new Date('2024-03-01T00:00:00')
            const endDate = new Date('2024-03-31T23:59:59')
            const events = await service.getEventsByDateRange('user-123', startDate, endDate)

            expect(events).toHaveLength(1)
            expect(events[0].uid).toBe('uid-range@b-calendar')
        })

        test('groupId 필터를 전달한다', async () => {
            const service = createCalendarService({ db: mockDb })
            const startDate = new Date('2024-03-01T00:00:00')
            const endDate = new Date('2024-03-31T23:59:59')

            await service.getEventsByDateRange('user-123', startDate, endDate, 'group-1')

            expect(mockDb.getEventsByDateRange).toHaveBeenCalledWith('user-123', startDate, endDate, 'group-1')
        })

        test('반복 이벤트를 포함한다', async () => {
            const mockRow = {
                uid: 'uid-recurring-range@b-calendar',
                summary: 'Weekly Range',
                description: null,
                location: null,
                dtstart: new Date('2024-03-01T10:00:00Z'),
                dtend: new Date('2024-03-01T11:00:00Z'),
                isAllDay: false,
                rrule: { freq: 'WEEKLY' as const, interval: 1 },
                exdate: null,
                status: null,
                transp: null,
                priority: null,
                categories: null,
                color: null,
                groupId: null,
                sequence: 0,
                createdAt: new Date('2024-03-01'),
                updatedAt: new Date('2024-03-01'),
            }
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const startDate = new Date('2024-03-01T00:00:00')
            const endDate = new Date('2024-03-31T23:59:59')
            const events = await service.getEventsByDateRange('user-123', startDate, endDate)

            expect(events).toHaveLength(5)
            expect(events.every((e) => e.uid === 'uid-recurring-range@b-calendar')).toBe(true)
            expect(events[0].rrule?.freq).toBe('WEEKLY')
            expect(new Set(events.map((e) => e.dtstart.toISOString())).size).toBe(5)
        })

        test('범위 밖 비반복 이벤트는 제외한다', async () => {
            const mockRow = {
                uid: 'uid-outside@b-calendar',
                summary: 'Outside Range',
                description: null,
                location: null,
                dtstart: new Date('2024-02-15T10:00:00Z'),
                dtend: new Date('2024-02-15T11:00:00Z'),
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
                createdAt: new Date('2024-02-15'),
                updatedAt: new Date('2024-02-15'),
            }
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const startDate = new Date('2024-03-01T00:00:00Z')
            const endDate = new Date('2024-03-31T23:59:59Z')
            const events = await service.getEventsByDateRange('user-123', startDate, endDate)

            expect(events).toHaveLength(0)
        })

        test('이벤트가 없으면 빈 배열을 반환한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const startDate = new Date('2024-03-01T00:00:00Z')
            const endDate = new Date('2024-03-31T23:59:59Z')
            const events = await service.getEventsByDateRange('user-123', startDate, endDate)

            expect(events).toEqual([])
        })

        test('groupId가 있는 이벤트를 반환한다', async () => {
            const mockRow = {
                uid: 'uid-grouped@b-calendar',
                summary: 'Grouped Event',
                description: null,
                location: null,
                dtstart: new Date('2024-03-15T10:00:00Z'),
                dtend: new Date('2024-03-15T11:00:00Z'),
                isAllDay: false,
                rrule: null,
                exdate: null,
                status: null,
                transp: null,
                priority: null,
                categories: null,
                color: null,
                groupId: 'group-1',
                sequence: 0,
                createdAt: new Date('2024-03-01'),
                updatedAt: new Date('2024-03-01'),
            }
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const startDate = new Date('2024-03-01T00:00:00Z')
            const endDate = new Date('2024-03-31T23:59:59Z')
            const events = await service.getEventsByDateRange('user-123', startDate, endDate, 'group-1')

            expect(events).toHaveLength(1)
            expect(events[0].groupId).toBe('group-1')
        })
    })

    describe('getGroups', () => {
        test('사용자의 그룹 목록을 조회한다', async () => {
            const mockGroups = [
                {
                    id: 'g1',
                    userId: 'user-123',
                    name: '개인',
                    color: 'bg-blue-500',
                    sortOrder: 0,
                    isVisible: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'g2',
                    userId: 'user-123',
                    name: '업무',
                    color: 'bg-red-500',
                    sortOrder: 1,
                    isVisible: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]
            ;(mockDb.getGroupsByUser as ReturnType<typeof mock>).mockResolvedValue(mockGroups)
            const service = createCalendarService({ db: mockDb })

            const groups = await service.getGroups('user-123')

            expect(groups).toHaveLength(2)
            expect(groups[0].name).toBe('개인')
        })
    })

    describe('createGroup', () => {
        test('그룹을 생성한다', async () => {
            const service = createCalendarService({ db: mockDb })

            const group = await service.createGroup('user-123', { name: '개인', color: 'bg-blue-500' })

            expect(group.name).toBe('개인')
            expect(group.color).toBe('bg-blue-500')
            expect(group.sortOrder).toBe(0)
            expect(group.isVisible).toBe(true)
            expect(mockDb.insertGroup).toHaveBeenCalled()
        })
    })

    describe('updateGroup', () => {
        test('존재하지 않는 그룹 수정 시 에러를 던진다', async () => {
            const service = createCalendarService({ db: mockDb })

            expect(service.updateGroup('user-123', 'non-existent', { name: '변경' })).rejects.toThrow()
        })

        test('그룹을 수정한다', async () => {
            const mockGroup = {
                id: 'g1',
                userId: 'user-123',
                name: '개인',
                color: 'bg-blue-500',
                sortOrder: 0,
                isVisible: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getGroupById as ReturnType<typeof mock>).mockResolvedValue(mockGroup)
            const service = createCalendarService({ db: mockDb })

            await service.updateGroup('user-123', 'g1', { name: '변경된 이름' })

            expect(mockDb.updateGroup).toHaveBeenCalledWith('user-123', 'g1', { name: '변경된 이름' })
        })
    })

    describe('deleteGroup', () => {
        test('이벤트가 있는 그룹 삭제 시 에러를 던진다', async () => {
            const mockGroup = {
                id: 'g1',
                userId: 'user-123',
                name: '개인',
                color: 'bg-blue-500',
                sortOrder: 0,
                isVisible: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getGroupById as ReturnType<typeof mock>).mockResolvedValue(mockGroup)
            ;(mockDb.countEventsByGroup as ReturnType<typeof mock>).mockResolvedValue(3)
            const service = createCalendarService({ db: mockDb })

            expect(service.deleteGroup('user-123', 'g1')).rejects.toThrow()
        })

        test('빈 그룹을 삭제한다', async () => {
            const mockGroup = {
                id: 'g1',
                userId: 'user-123',
                name: '개인',
                color: 'bg-blue-500',
                sortOrder: 0,
                isVisible: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getGroupById as ReturnType<typeof mock>).mockResolvedValue(mockGroup)
            ;(mockDb.countEventsByGroup as ReturnType<typeof mock>).mockResolvedValue(0)
            const service = createCalendarService({ db: mockDb })

            await service.deleteGroup('user-123', 'g1')

            expect(mockDb.deleteGroup).toHaveBeenCalledWith('user-123', 'g1')
        })

        test('존재하지 않는 그룹 삭제 시 에러를 던진다', async () => {
            const service = createCalendarService({ db: mockDb })

            expect(service.deleteGroup('user-123', 'non-existent')).rejects.toThrow()
        })
    })

    describe('반복 일정 발생 전개 (BUG-1)', () => {
        const RECURRING_START = new Date('2024-01-01T10:00:00Z')
        const RECURRING_END = new Date('2024-01-01T11:00:00Z')
        const expectedDurationMs = RECURRING_END.getTime() - RECURRING_START.getTime()

        test('getEventsByMonth: 주간 반복을 각 발생일 인스턴스로 전개한다', async () => {
            const mockRow = createEventRow({
                uid: 'uid-weekly@b-calendar',
                summary: 'Weekly Meeting',
                dtstart: RECURRING_START,
                dtend: RECURRING_END,
                rrule: { freq: 'WEEKLY', interval: 1 },
            })
            ;(mockDb.getEventsByMonthRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByMonth('user-123', 2024, 0)

            expect(events.map((e) => e.dtstart.toISOString())).toEqual([
                '2024-01-01T10:00:00.000Z',
                '2024-01-08T10:00:00.000Z',
                '2024-01-15T10:00:00.000Z',
                '2024-01-22T10:00:00.000Z',
                '2024-01-29T10:00:00.000Z',
            ])
            expect(events.every((e) => e.uid === 'uid-weekly@b-calendar')).toBe(true)
            expect(events.every((e) => e.dtend.getTime() - e.dtstart.getTime() === expectedDurationMs)).toBe(true)
        })

        test('getEventsByDateRange: 일간 반복(count 3)을 3개 인스턴스로 전개한다', async () => {
            const dailyStart = new Date('2024-03-10T09:00:00Z')
            const dailyEnd = new Date('2024-03-10T10:00:00Z')
            const mockRow = createEventRow({
                uid: 'uid-daily@b-calendar',
                summary: 'Daily Standup',
                dtstart: dailyStart,
                dtend: dailyEnd,
                rrule: { freq: 'DAILY', interval: 1, count: 3 },
            })
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByDateRange('user-123', new Date('2024-03-01T00:00:00Z'), new Date('2024-03-31T23:59:59Z'))

            expect(events.map((e) => e.dtstart.toISOString())).toEqual([
                '2024-03-10T09:00:00.000Z',
                '2024-03-11T09:00:00.000Z',
                '2024-03-12T09:00:00.000Z',
            ])
            expect(events.every((e) => e.uid === 'uid-daily@b-calendar')).toBe(true)
            const expectedDaily = dailyEnd.getTime() - dailyStart.getTime()
            expect(events.every((e) => e.dtend.getTime() - e.dtstart.getTime() === expectedDaily)).toBe(true)
        })
    })

    describe('범위 overlap 필터 (BUG-2)', () => {
        test('getEventsByMonth: 범위 시작 전 시작해 범위 안으로 이어지는 다일 이벤트를 포함한다', async () => {
            const mockRow = createEventRow({
                uid: 'uid-multiday@b-calendar',
                summary: 'Multi-day trip',
                dtstart: new Date('2024-02-28T10:00:00Z'),
                dtend: new Date('2024-03-05T11:00:00Z'),
            })
            ;(mockDb.getEventsByMonthRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByMonth('user-123', 2024, 2)

            expect(events).toHaveLength(1)
            expect(events[0].uid).toBe('uid-multiday@b-calendar')
        })

        test('getEventsByDateRange: 범위 시작 전 시작해 범위 안으로 이어지는 다일 이벤트를 포함한다', async () => {
            const mockRow = createEventRow({
                uid: 'uid-multiday-range@b-calendar',
                summary: 'Multi-day trip',
                dtstart: new Date('2024-02-25T10:00:00Z'),
                dtend: new Date('2024-03-03T11:00:00Z'),
            })
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByDateRange('user-123', new Date('2024-03-01T00:00:00Z'), new Date('2024-03-31T23:59:59Z'))

            expect(events).toHaveLength(1)
            expect(events[0].uid).toBe('uid-multiday-range@b-calendar')
        })

        test('getEventsByDateRange: 범위 전체를 감싸는 이벤트를 포함한다', async () => {
            const mockRow = createEventRow({
                uid: 'uid-spanning@b-calendar',
                summary: 'Spanning',
                dtstart: new Date('2024-02-01T00:00:00Z'),
                dtend: new Date('2024-04-30T00:00:00Z'),
            })
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByDateRange('user-123', new Date('2024-03-01T00:00:00Z'), new Date('2024-03-31T23:59:59Z'))

            expect(events).toHaveLength(1)
            expect(events[0].uid).toBe('uid-spanning@b-calendar')
        })

        test('getEventsByDateRange: 범위와 전혀 겹치지 않는 이벤트는 제외한다', async () => {
            const mockRow = createEventRow({
                uid: 'uid-nooverlap@b-calendar',
                summary: 'No overlap',
                dtstart: new Date('2024-01-05T10:00:00Z'),
                dtend: new Date('2024-01-05T11:00:00Z'),
            })
            ;(mockDb.getEventsByDateRange as ReturnType<typeof mock>).mockResolvedValue([mockRow])
            const service = createCalendarService({ db: mockDb })

            const events = await service.getEventsByDateRange('user-123', new Date('2024-03-01T00:00:00Z'), new Date('2024-03-31T23:59:59Z'))

            expect(events).toHaveLength(0)
        })
    })
})

describe('CalendarService ETag 일관성 (E-22)', () => {
    test('생성 응답 ETag 와 저장 후 조회 ETag 가 같다', async () => {
        let stored: CalendarEventRow | null = null
        const db: CalendarServiceDb = {
            ...createMockDb(),
            insertEvent: async (data) => {
                stored = createEventRow({ uid: data.uid, createdAt: data.updatedAt, updatedAt: data.updatedAt })
            },
            getEventByUid: async () => stored,
        }
        const service = createCalendarService({ db })

        const { event, created } = await service.upsertEventByUid('user-123', 'etag-uid', {
            summary: '새 이벤트',
            dtstart: new Date('2024-01-01T10:00:00Z'),
            dtend: new Date('2024-01-01T11:00:00Z'),
            isAllDay: false,
        })

        expect(created).toBe(true)
        const reloaded = await service.getEventByUid('user-123', 'etag-uid')
        expect(reloaded).not.toBeNull()
        expect(service.getEventEtag(event)).toBe(service.getEventEtag(reloaded!))
    })

    test('수정 응답 ETag 와 저장 후 조회 ETag 가 같다', async () => {
        let stored: CalendarEventRow | null = createEventRow({ uid: 'etag-uid', updatedAt: new Date('2020-01-01T00:00:00Z') })
        const db: CalendarServiceDb = {
            ...createMockDb(),
            updateEvent: async (_userId, uid, data) => {
                stored = createEventRow({ uid, updatedAt: data.updatedAt })
            },
            getEventByUid: async () => stored,
        }
        const service = createCalendarService({ db })

        const { event, created } = await service.upsertEventByUid('user-123', 'etag-uid', {
            summary: '수정된 이벤트',
            dtstart: new Date('2024-01-01T10:00:00Z'),
            dtend: new Date('2024-01-01T11:00:00Z'),
            isAllDay: false,
        })

        expect(created).toBe(false)
        const reloaded = await service.getEventByUid('user-123', 'etag-uid')
        expect(service.getEventEtag(event)).toBe(service.getEventEtag(reloaded!))
    })

    test('exdate 를 저장한다 (D-15)', async () => {
        let insertedExdate: string[] | null | undefined
        const db: CalendarServiceDb = {
            ...createMockDb(),
            insertEvent: async (data) => {
                insertedExdate = data.exdate
            },
        }
        const service = createCalendarService({ db })

        await service.upsertEventByUid('user-123', 'exdate-uid', {
            summary: '반복 이벤트',
            dtstart: new Date('2024-01-01T10:00:00Z'),
            dtend: new Date('2024-01-01T11:00:00Z'),
            isAllDay: false,
            exdate: ['20240103T100000Z'],
        })

        expect(insertedExdate).toEqual(['20240103T100000Z'])
    })
})
