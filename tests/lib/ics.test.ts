import { describe, it, expect } from 'bun:test'
import { generateIcsUid, generateSubscriptionToken, generateTimezoneComponent, getRecurrenceOccurrences, eventsToICS } from '../../lib/ics'

type RecurrenceRule = {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval?: number
    count?: number
    until?: Date | string
    byDay?: string[]
    byMonth?: number[]
    byMonthDay?: number[]
}

type CalendarEvent = {
    uid: string
    summary: string
    description?: string | null
    location?: string | null
    dtstart: Date
    dtend: Date
    isAllDay: boolean
    rrule?: RecurrenceRule | null
    exdate?: string[] | null
    status?: string | null
    transp?: string | null
    priority?: number | null
    categories?: string[] | null
    sequence?: number
    created?: Date | null
    lastModified?: Date | null
    color?: string | null
}

describe('generateIcsUid', () => {
    it('@b-calendar 접미사가 포함된 UID를 생성한다', () => {
        const uid = generateIcsUid()

        expect(uid).toContain('@b-calendar')
    })

    it('고유한 UID를 생성한다', () => {
        const uid1 = generateIcsUid()
        const uid2 = generateIcsUid()

        expect(uid1).not.toBe(uid2)
    })
})

describe('generateSubscriptionToken', () => {
    it('64자리 16진수 토큰을 생성한다', () => {
        const token = generateSubscriptionToken()

        expect(token).toHaveLength(64)
        expect(/^[0-9a-f]+$/.test(token)).toBe(true)
    })

    it('고유한 토큰을 생성한다', () => {
        const token1 = generateSubscriptionToken()
        const token2 = generateSubscriptionToken()

        expect(token1).not.toBe(token2)
    })
})

describe('getRecurrenceOccurrences', () => {
    it('일간 반복 규칙의 발생 횟수를 반환한다', () => {
        const rrule: RecurrenceRule = { freq: 'DAILY', interval: 1 }
        const dtstart = new Date('2024-01-01T10:00:00')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-01-05T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        expect(occurrences.length).toBeGreaterThanOrEqual(4)
    })

    it('주간 반복 규칙의 발생 횟수를 반환한다', () => {
        const rrule: RecurrenceRule = { freq: 'WEEKLY', interval: 1 }
        const dtstart = new Date('2024-01-01T10:00:00')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-01-31T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        expect(occurrences.length).toBeGreaterThanOrEqual(4)
    })

    it('count 제한을 준수한다', () => {
        const rrule: RecurrenceRule = { freq: 'DAILY', interval: 1, count: 3 }
        const dtstart = new Date('2024-01-01T10:00:00')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-12-31T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        expect(occurrences).toHaveLength(3)
    })

    it('until 날짜를 준수한다', () => {
        const rrule: RecurrenceRule = {
            freq: 'DAILY',
            interval: 1,
            until: new Date('2024-01-03T23:59:59'),
        }
        const dtstart = new Date('2024-01-01T10:00:00')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-12-31T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        expect(occurrences.length).toBeLessThanOrEqual(3)
    })

    it('MONTHLY with byMonthDay 반복을 처리한다', () => {
        const rrule: RecurrenceRule = { freq: 'MONTHLY', interval: 1, byMonthDay: [15, 30] }
        const dtstart = new Date('2024-01-15T10:00:00Z')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-03-31T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        const days = occurrences.map((d) => d.getUTCDate())
        expect(days.every((d) => d === 15 || d === 30)).toBe(true)
        expect(occurrences.length).toBeGreaterThanOrEqual(4)
    })

    it('YEARLY with byMonth 반복을 처리한다', () => {
        const rrule: RecurrenceRule = { freq: 'YEARLY', interval: 1, byMonth: [1, 7] }
        const dtstart = new Date('2024-01-15T10:00:00Z')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2025-12-31T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        const months = occurrences.map((d) => d.getUTCMonth() + 1)
        expect(months.every((m) => m === 1 || m === 7)).toBe(true)
    })

    it('byDay가 비어있으면 무시한다', () => {
        const rrule: RecurrenceRule = { freq: 'DAILY', interval: 1, byDay: [] }
        const dtstart = new Date('2024-01-01T10:00:00')
        const rangeStart = new Date('2024-01-01')
        const rangeEnd = new Date('2024-01-05T23:59:59')

        const occurrences = getRecurrenceOccurrences(rrule, dtstart, rangeStart, rangeEnd)

        expect(occurrences.length).toBeGreaterThanOrEqual(4)
    })
})

describe('eventsToICS', () => {
    it('유효한 ICS 형식을 생성한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'test-uid@b-calendar',
                summary: 'Test Event',
                dtstart: new Date('2024-01-15T10:00:00'),
                dtend: new Date('2024-01-15T11:00:00'),
                isAllDay: false,
            },
        ]

        const ics = eventsToICS(events, 'Test Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('BEGIN:VCALENDAR')
        expect(ics).toContain('END:VCALENDAR')
        expect(ics).toContain('BEGIN:VEVENT')
        expect(ics).toContain('END:VEVENT')
        expect(ics).toContain('UID:test-uid@b-calendar')
        expect(ics).toContain('SUMMARY:Test Event')
    })

    it('종일 이벤트를 처리한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'test-uid@b-calendar',
                summary: 'All Day Event',
                dtstart: new Date('2024-01-15'),
                dtend: new Date('2024-01-16'),
                isAllDay: true,
            },
        ]

        const ics = eventsToICS(events, 'Test Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('DTSTART;VALUE=DATE:')
        expect(ics).toContain('DTEND;VALUE=DATE:')
    })

    it('선택적 필드를 포함한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'test-uid@b-calendar',
                summary: 'Full Event',
                description: 'Test Description',
                location: 'Test Location',
                dtstart: new Date('2024-01-15T10:00:00'),
                dtend: new Date('2024-01-15T11:00:00'),
                isAllDay: false,
                status: 'CONFIRMED',
                transp: 'OPAQUE',
                priority: 5,
                categories: ['work', 'important'],
            },
        ]

        const ics = eventsToICS(events, 'Test Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('DESCRIPTION:Test Description')
        expect(ics).toContain('LOCATION:Test Location')
        expect(ics).toContain('STATUS:CONFIRMED')
        expect(ics).toContain('TRANSP:OPAQUE')
        expect(ics).toContain('PRIORITY:5')
        expect(ics).toContain('CATEGORIES:work,important')
    })

    it('반복 규칙을 포함한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'test-uid@b-calendar',
                summary: 'Recurring Event',
                dtstart: new Date('2024-01-15T10:00:00'),
                dtend: new Date('2024-01-15T11:00:00'),
                isAllDay: false,
                rrule: {
                    freq: 'WEEKLY',
                    interval: 2,
                    byDay: ['MO', 'WE', 'FR'],
                },
            },
        ]

        const ics = eventsToICS(events, 'Test Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR')
    })

    it('특수 문자를 이스케이프한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'test-uid@b-calendar',
                summary: 'Event; with, special\\chars',
                description: 'Line1\nLine2',
                dtstart: new Date('2024-01-15T10:00:00'),
                dtend: new Date('2024-01-15T11:00:00'),
                isAllDay: false,
            },
        ]

        const ics = eventsToICS(events, 'Test Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('Event\\; with\\, special\\\\chars')
        expect(ics).toContain('Line1\\nLine2')
    })

    it('빈 이벤트 배열을 처리한다', () => {
        const ics = eventsToICS([], 'Empty Calendar', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('BEGIN:VCALENDAR')
        expect(ics).toContain('END:VCALENDAR')
        expect(ics).not.toContain('BEGIN:VEVENT')
    })

    it('시간 이벤트에 UTC 포맷을 사용한다', () => {
        const events = [
            {
                uid: 'utc-test@b-calendar',
                summary: 'UTC Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            },
        ]
        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')
        expect(ics).toContain('DTSTART:20240115T100000Z')
        expect(ics).toContain('DTEND:20240115T110000Z')
    })

    it('VTIMEZONE 컴포넌트를 포함한다', () => {
        const ics = eventsToICS([], 'Test', 'test.com', 'Asia/Seoul')
        expect(ics).toContain('BEGIN:VTIMEZONE')
        expect(ics).toContain('TZID:Asia/Seoul')
        expect(ics).toContain('END:VTIMEZONE')
    })

    it('종일 이벤트의 EXDATE에 VALUE=DATE를 포함한다', () => {
        const events = [
            {
                uid: 'exdate-test@b-calendar',
                summary: 'Test',
                dtstart: new Date('2024-01-15'),
                dtend: new Date('2024-01-16'),
                isAllDay: true,
                exdate: ['20240120T000000Z'],
            },
        ]
        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')
        expect(ics).toContain('EXDATE;VALUE=DATE:20240120')
    })

    it('RRULE interval=1은 INTERVAL을 생략한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'interval1@b-calendar',
                summary: 'Daily Event',
                dtstart: new Date('2024-01-15T10:00:00'),
                dtend: new Date('2024-01-15T11:00:00'),
                isAllDay: false,
                rrule: { freq: 'DAILY', interval: 1 },
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('RRULE:FREQ=DAILY')
        expect(ics).not.toContain('INTERVAL=1')
    })

    it('created와 lastModified를 UTC 포맷으로 출력한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'timestamps@b-calendar',
                summary: 'Timestamps Event',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                created: new Date('2024-01-10T08:30:00Z'),
                lastModified: new Date('2024-01-12T14:00:00Z'),
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('CREATED:20240110T083000Z')
        expect(ics).toContain('LAST-MODIFIED:20240112T140000Z')
    })

    it('sequence=0도 출력한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'seq0@b-calendar',
                summary: 'Seq Zero',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
                sequence: 0,
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('SEQUENCE:0')
    })

    it('여러 이벤트를 한 VCALENDAR에 포함한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'event1@b-calendar',
                summary: 'Event 1',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            },
            {
                uid: 'event2@b-calendar',
                summary: 'Event 2',
                dtstart: new Date('2024-01-16T10:00:00Z'),
                dtend: new Date('2024-01-16T11:00:00Z'),
                isAllDay: false,
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        const vcalendarCount = ics.split('BEGIN:VCALENDAR').length - 1
        const veventCount = ics.split('BEGIN:VEVENT').length - 1
        expect(vcalendarCount).toBe(1)
        expect(veventCount).toBe(2)
    })

    it('description과 location이 null이면 생략한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'nullfields@b-calendar',
                summary: 'No Desc/Loc',
                description: null,
                location: null,
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        expect(ics).not.toContain('DESCRIPTION:')
        expect(ics).not.toContain('LOCATION:')
    })

    it('CRLF 줄바꿈을 사용한다', () => {
        const events: CalendarEvent[] = [
            {
                uid: 'crlf@b-calendar',
                summary: 'CRLF Test',
                dtstart: new Date('2024-01-15T10:00:00Z'),
                dtend: new Date('2024-01-15T11:00:00Z'),
                isAllDay: false,
            },
        ]

        const ics = eventsToICS(events, 'Test', 'test.com', 'Asia/Seoul')

        expect(ics).toContain('\r\n')
        const lines = ics.split('\r\n')
        expect(lines.length).toBeGreaterThan(1)
    })
})

describe('generateTimezoneComponent', () => {
    it('타임존 ID를 VTIMEZONE에 포함한다', () => {
        const result = generateTimezoneComponent('Asia/Seoul')
        const joined = result.join('\n')

        expect(joined).toContain('TZID:Asia/Seoul')
        expect(joined).toContain('BEGIN:VTIMEZONE')
        expect(joined).toContain('END:VTIMEZONE')
    })

    it('STANDARD 블록을 포함한다', () => {
        const result = generateTimezoneComponent('America/New_York')
        const joined = result.join('\n')

        expect(joined).toContain('BEGIN:STANDARD')
        expect(joined).toContain('END:STANDARD')
    })
})
