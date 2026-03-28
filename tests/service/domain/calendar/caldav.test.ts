import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createCaldavService } from '../../../../service/domain/calendar/caldav'
import type { CaldavServiceDb } from '../../../../service/domain/calendar/caldav'

const createMockDb = (): CaldavServiceDb => ({
    getSubscriptionByUserId: mock(() => Promise.resolve(null)),
    getAllEvents: mock(() => Promise.resolve([])),
    getChangedEventsSince: mock(() => Promise.resolve([])),
    getDeletedEventsSince: mock(() => Promise.resolve([])),
    getFreeBusyEvents: mock(() => Promise.resolve([])),
    insertDeletedEvent: mock(() => Promise.resolve()),
    getUserTimezone: mock(() => Promise.resolve(null)),
})

let mockDb: CaldavServiceDb

describe('CaldavService', () => {
    let service: ReturnType<typeof createCaldavService>

    beforeEach(() => {
        mockDb = createMockDb()
        service = createCaldavService({ db: mockDb })
    })

    describe('getSyncToken / parseSyncToken', () => {
        test('sync token을 생성하고 파싱한다', () => {
            const token = service.getSyncToken('abc123')
            expect(token).toBe('http://b-calendar/sync/abc123')

            const ctag = service.parseSyncToken(token)
            expect(ctag).toBe('abc123')
        })

        test('유효하지 않은 토큰은 null을 반환한다', () => {
            const ctag = service.parseSyncToken('invalid-token')
            expect(ctag).toBeNull()
        })

        test('빈 ctag 부분이면 null을 반환한다', () => {
            const ctag = service.parseSyncToken('http://b-calendar/sync/')
            expect(ctag).toBeNull()
        })

        test('다른 도메인 URL이면 null을 반환한다', () => {
            const ctag = service.parseSyncToken('http://other/sync/abc')
            expect(ctag).toBeNull()
        })
    })

    describe('getCalendarProperties', () => {
        const mockSubscription = {
            id: 'sub-1',
            userId: 'user-1',
            token: 'token-123',
            icsToken: 'ics-token-123',
            name: 'My Calendar',
            isActive: true,
            ctag: 'ctag-123',
            lastAccessedAt: null,
        }

        test('resourcetype를 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['resourcetype'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:resourcetype']).toEqual({ 'D:collection': '', 'C:calendar': '' })
        })

        test('displayname을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['displayname'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:displayname']).toBe('My Calendar')
        })

        test('getctag을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['getctag'], '/caldav/token/', 'Asia/Seoul')
            expect(found['CS:getctag']).toBe('ctag-123')
        })

        test('sync-token을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['sync-token'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:sync-token']).toBe('http://b-calendar/sync/ctag-123')
        })

        test('supported-calendar-component-set을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['supported-calendar-component-set'], '/caldav/token/', 'Asia/Seoul')
            expect(found['C:supported-calendar-component-set']).toEqual({ 'C:comp': { '@_name': 'VEVENT' } })
        })

        test('current-user-privilege-set을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['current-user-privilege-set'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:current-user-privilege-set']).toBeDefined()
            const privileges = found['D:current-user-privilege-set'] as { 'D:privilege': Array<Record<string, string>> }
            expect(privileges['D:privilege']).toHaveLength(5)
        })

        test('supported-report-set을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['supported-report-set'], '/caldav/token/', 'Asia/Seoul')
            const reportSet = found['D:supported-report-set'] as { 'D:supported-report': Array<Record<string, unknown>> }
            expect(reportSet['D:supported-report']).toHaveLength(4)
        })

        test('calendar-timezone을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['calendar-timezone'], '/caldav/token/', 'Asia/Seoul')
            expect(found['C:calendar-timezone']).toContain('BEGIN:VTIMEZONE')
            expect(found['C:calendar-timezone']).toContain('Asia/Seoul')
        })

        test('알 수 없는 속성은 notFound에 포함한다', () => {
            const { notFound } = service.getCalendarProperties(mockSubscription, ['unknown-prop'], '/caldav/token/', 'Asia/Seoul')
            expect(notFound).toContain('unknown-prop')
        })

        test('여러 속성을 한 번에 반환한다', () => {
            const { found } = service.getCalendarProperties(
                mockSubscription,
                ['resourcetype', 'displayname', 'getctag'],
                '/caldav/token/',
                'Asia/Seoul',
            )
            expect(found['D:resourcetype']).toBeDefined()
            expect(found['D:displayname']).toBe('My Calendar')
            expect(found['CS:getctag']).toBe('ctag-123')
        })

        test('빈 requestedProps 배열이면 빈 found를 반환한다', () => {
            const { found, notFound } = service.getCalendarProperties(mockSubscription, [], '/caldav/token/', 'Asia/Seoul')
            expect(Object.keys(found)).toHaveLength(0)
            expect(notFound).toHaveLength(0)
        })

        test('subscription.name이 null이면 "B-Calendar"를 반환한다', () => {
            const nullNameSub = { ...mockSubscription, name: null }
            const { found } = service.getCalendarProperties(nullNameSub, ['displayname'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:displayname']).toBe('B-Calendar')
        })

        test('calendar-color 속성을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['calendar-color'], '/caldav/token/', 'Asia/Seoul')
            expect(found['A:calendar-color']).toBe('#0E61B9FF')
        })

        test('calendar-description 속성을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['calendar-description'], '/caldav/token/', 'Asia/Seoul')
            expect(found['C:calendar-description']).toBe('')
        })

        test('getcontenttype 속성을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['getcontenttype'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:getcontenttype']).toBe('text/calendar; component=vevent')
        })

        test('owner 속성을 반환한다', () => {
            const { found } = service.getCalendarProperties(mockSubscription, ['owner'], '/caldav/token/', 'Asia/Seoul')
            expect(found['D:owner']).toEqual({ 'D:href': '/caldav/token/' })
        })
    })

    describe('getFreeBusy', () => {
        test('OPAQUE 이벤트만 포함한다', async () => {
            ;(mockDb.getFreeBusyEvents as ReturnType<typeof mock>).mockResolvedValue([
                { dtstart: new Date('2024-01-15T10:00:00Z'), dtend: new Date('2024-01-15T11:00:00Z'), status: 'CONFIRMED' },
            ])

            const result = await service.getFreeBusy('user-1', new Date('2024-01-15T00:00:00Z'), new Date('2024-01-16T00:00:00Z'))

            expect(result).toHaveLength(1)
            expect(result[0].type).toBe('BUSY')
        })

        test('TENTATIVE 이벤트는 BUSY-TENTATIVE 타입이다', async () => {
            ;(mockDb.getFreeBusyEvents as ReturnType<typeof mock>).mockResolvedValue([
                { dtstart: new Date('2024-01-15T10:00:00Z'), dtend: new Date('2024-01-15T11:00:00Z'), status: 'TENTATIVE' },
            ])

            const result = await service.getFreeBusy('user-1', new Date('2024-01-15T00:00:00Z'), new Date('2024-01-16T00:00:00Z'))

            expect(result).toHaveLength(1)
            expect(result[0].type).toBe('BUSY-TENTATIVE')
        })

        test('이벤트가 없으면 빈 배열을 반환한다', async () => {
            const result = await service.getFreeBusy('user-1', new Date('2024-01-15T00:00:00Z'), new Date('2024-01-16T00:00:00Z'))

            expect(result).toEqual([])
        })
    })

    describe('buildPropfindResponse', () => {
        test('found props와 notFound props를 올바르게 분리한다', () => {
            const result = service.buildPropfindResponse('/caldav/token/', { 'D:displayname': 'My Cal' }, ['unknown-prop'])

            expect(result.propstats).toHaveLength(2)
            expect(result.propstats[0].status).toBe(200)
            expect(result.propstats[0].props['D:displayname']).toBe('My Cal')
            expect(result.propstats[1].status).toBe(404)
            expect(result.propstats[1].props['unknown-prop']).toBe('')
        })

        test('notFoundProps가 비어있으면 404 propstat을 생략한다', () => {
            const result = service.buildPropfindResponse('/caldav/token/', { 'D:displayname': 'My Cal' }, [])

            expect(result.propstats).toHaveLength(1)
            expect(result.propstats[0].status).toBe(200)
        })
    })

    describe('generateFreeBusyICS', () => {
        test('유효한 VFREEBUSY를 생성한다', () => {
            const periods = [
                { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T11:00:00Z'), type: 'BUSY' as const },
                { start: new Date('2024-01-15T14:00:00Z'), end: new Date('2024-01-15T15:00:00Z'), type: 'BUSY-TENTATIVE' as const },
            ]
            const start = new Date('2024-01-15T00:00:00Z')
            const end = new Date('2024-01-16T00:00:00Z')

            const ics = service.generateFreeBusyICS(periods, start, end)

            expect(ics).toContain('BEGIN:VCALENDAR')
            expect(ics).toContain('BEGIN:VFREEBUSY')
            expect(ics).toContain('END:VFREEBUSY')
            expect(ics).toContain('END:VCALENDAR')
            expect(ics).toContain('FREEBUSY;FBTYPE=BUSY:')
            expect(ics).toContain('FREEBUSY;FBTYPE=BUSY-TENTATIVE:')
        })

        test('organizer를 포함한다', () => {
            const ics = service.generateFreeBusyICS([], new Date('2024-01-15T00:00:00Z'), new Date('2024-01-16T00:00:00Z'), 'mailto:user@example.com')
            expect(ics).toContain('ORGANIZER:mailto:user@example.com')
        })
    })

    describe('generateTimezoneComponent', () => {
        test('VTIMEZONE 컴포넌트를 생성한다', () => {
            const tz = service.generateTimezoneComponent('America/New_York')
            expect(tz).toContain('BEGIN:VTIMEZONE')
            expect(tz).toContain('TZID:America/New_York')
            expect(tz).toContain('END:VTIMEZONE')
        })
    })

    describe('getUserTimezone', () => {
        test('기본값 Asia/Seoul을 반환한다', async () => {
            const tz = await service.getUserTimezone('user-123')
            expect(tz).toBe('Asia/Seoul')
        })

        test('사용자 타임존을 반환한다', async () => {
            ;(mockDb.getUserTimezone as ReturnType<typeof mock>).mockResolvedValue('Europe/London')

            const tz = await service.getUserTimezone('user-123')
            expect(tz).toBe('Europe/London')
        })
    })

    describe('getChangesFromToken', () => {
        test('구독이 없으면 빈 결과를 반환한다', async () => {
            const result = await service.getChangesFromToken('user-1', null)
            expect(result.changed).toHaveLength(0)
            expect(result.deleted).toHaveLength(0)
            expect(result.syncToken).toBe('http://b-calendar/sync/0')
        })

        test('토큰이 없으면 모든 이벤트를 반환한다', async () => {
            const mockEvent = {
                uid: 'uid-1@b-calendar',
                summary: 'Event 1',
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
                sequence: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getSubscriptionByUserId as ReturnType<typeof mock>).mockResolvedValue({
                id: 'sub-1',
                userId: 'user-1',
                token: 'token',
                icsToken: 'ics-token',
                name: 'Cal',
                isActive: true,
                ctag: 'current-ctag',
                lastAccessedAt: null,
            })
            ;(mockDb.getAllEvents as ReturnType<typeof mock>).mockResolvedValue([mockEvent])

            const result = await service.getChangesFromToken('user-1', null)

            expect(result.changed).toHaveLength(1)
            expect(result.deleted).toHaveLength(0)
            expect(result.syncToken).toBe('http://b-calendar/sync/current-ctag')
        })

        test('유효한 토큰이면 변경된 이벤트만 반환한다', async () => {
            const changedEvent = {
                uid: 'uid-changed@b-calendar',
                summary: 'Changed Event',
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
                sequence: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            ;(mockDb.getSubscriptionByUserId as ReturnType<typeof mock>).mockResolvedValue({
                id: 'sub-1',
                userId: 'user-1',
                token: 'token',
                icsToken: 'ics-token',
                name: 'Cal',
                isActive: true,
                ctag: 'new-ctag',
                lastAccessedAt: null,
            })
            ;(mockDb.getChangedEventsSince as ReturnType<typeof mock>).mockResolvedValue([changedEvent])
            ;(mockDb.getDeletedEventsSince as ReturnType<typeof mock>).mockResolvedValue([])

            const result = await service.getChangesFromToken('user-1', 'http://b-calendar/sync/old-ctag')

            expect(result.changed).toHaveLength(1)
            expect(result.changed[0].uid).toBe('uid-changed@b-calendar')
            expect(result.deleted).toHaveLength(0)
        })

        test('삭제된 이벤트 UID를 포함한다', async () => {
            ;(mockDb.getSubscriptionByUserId as ReturnType<typeof mock>).mockResolvedValue({
                id: 'sub-1',
                userId: 'user-1',
                token: 'token',
                icsToken: 'ics-token',
                name: 'Cal',
                isActive: true,
                ctag: 'new-ctag',
                lastAccessedAt: null,
            })
            ;(mockDb.getChangedEventsSince as ReturnType<typeof mock>).mockResolvedValue([])
            ;(mockDb.getDeletedEventsSince as ReturnType<typeof mock>).mockResolvedValue([
                { uid: 'deleted-uid-1', syncToken: 'tok1' },
                { uid: 'deleted-uid-2', syncToken: 'tok2' },
            ])

            const result = await service.getChangesFromToken('user-1', 'http://b-calendar/sync/old-ctag')

            expect(result.deleted).toHaveLength(2)
            expect(result.deleted).toContain('deleted-uid-1')
            expect(result.deleted).toContain('deleted-uid-2')
        })

        test('토큰이 있으면 변경된 이벤트만 반환한다 (Bug #4 수정)', async () => {
            ;(mockDb.getSubscriptionByUserId as ReturnType<typeof mock>).mockResolvedValue({
                id: 'sub-1',
                userId: 'user-1',
                token: 'token',
                icsToken: 'ics-token',
                name: 'Cal',
                isActive: true,
                ctag: 'new-ctag',
                lastAccessedAt: null,
            })
            ;(mockDb.getChangedEventsSince as ReturnType<typeof mock>).mockResolvedValue([])
            ;(mockDb.getDeletedEventsSince as ReturnType<typeof mock>).mockResolvedValue([{ uid: 'deleted-uid', syncToken: 'tok' }])

            const result = await service.getChangesFromToken('user-1', 'http://b-calendar/sync/old-ctag')

            expect(result.changed).toHaveLength(0)
            expect(result.deleted).toHaveLength(1)
            expect(result.deleted[0]).toBe('deleted-uid')
            expect(mockDb.getChangedEventsSince).toHaveBeenCalled()
        })
    })
})
