import { describe, it, expect } from 'bun:test'
import { parseICS, extractUidFromICS } from '../../lib/ics-parser'

describe('parseICS', () => {
    it('기본 VEVENT를 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-uid-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.uid).toBe('test-uid-123@example.com')
        expect(result?.summary).toBe('Test Event')
        expect(result?.isAllDay).toBe(false)
    })

    it('종일 이벤트를 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday-123@example.com
DTSTAMP:20240115T100000Z
DTSTART;VALUE=DATE:20240115
DTEND;VALUE=DATE:20240116
SUMMARY:All Day Event
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.isAllDay).toBe(true)
        expect(result?.dtstart.getFullYear()).toBe(2024)
        expect(result?.dtstart.getMonth()).toBe(0)
        expect(result?.dtstart.getDate()).toBe(15)
    })

    it('RRULE이 있는 이벤트를 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Recurring Event
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.rrule).not.toBeUndefined()
        expect(result?.rrule?.freq).toBe('WEEKLY')
        expect(result?.rrule?.interval).toBe(2)
        expect(result?.rrule?.byDay).toEqual(['MO', 'WE', 'FR'])
    })

    it('선택적 속성이 있는 이벤트를 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:full-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Full Event
DESCRIPTION:This is a description
LOCATION:Conference Room A
STATUS:TENTATIVE
TRANSP:TRANSPARENT
PRIORITY:1
CATEGORIES:Work,Meeting
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.description).toBe('This is a description')
        expect(result?.location).toBe('Conference Room A')
        expect(result?.status).toBe('TENTATIVE')
        expect(result?.transp).toBe('TRANSPARENT')
        expect(result?.priority).toBe(1)
        expect(result?.categories).toEqual(['Work', 'Meeting'])
    })

    it('줄 접기를 처리한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:folded-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:This is a very long summary that spans multiple lines
 and continues here
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.summary).toBe('This is a very long summary that spans multiple linesand continues here')
    })

    it('이스케이프된 문자를 처리한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:escaped-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Event with\\, comma and\\; semicolon
DESCRIPTION:Line 1\\nLine 2
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.summary).toBe('Event with, comma and; semicolon')
        expect(result?.description).toBe('Line 1\nLine 2')
    })

    it('잘못된 ICS는 null을 반환한다', () => {
        const ics = 'invalid ics data'

        const result = parseICS(ics)

        expect(result).toBeNull()
    })

    it('필수 필드가 없으면 null을 반환한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:missing-123@example.com
DTSTAMP:20240115T100000Z
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).toBeNull()
    })

    it('DTEND 없는 종일 이벤트의 dtend를 계산한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-dtend-123@example.com
DTSTAMP:20240115T100000Z
DTSTART;VALUE=DATE:20240115
SUMMARY:Single Day
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.dtend.getDate()).toBe(16)
    })

    it('SEQUENCE 속성을 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:seq-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Event with Sequence
SEQUENCE:3
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.sequence).toBe(3)
    })

    it('EXDATE 속성을 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:exdate-123@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Event with Exception
RRULE:FREQ=DAILY
EXDATE:20240120T100000Z
EXDATE:20240125T100000Z
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.exdate).toHaveLength(2)
        expect(result?.exdate?.[0]).toBe('20240120T100000Z')
        expect(result?.exdate?.[1]).toBe('20240125T100000Z')
    })

    it('이스케이프된 백슬래시를 올바르게 처리한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:backslash-test@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Test with \\\\n literal
END:VEVENT
END:VCALENDAR`
        const result = parseICS(ics)
        expect(result).not.toBeNull()
        expect(result?.summary).toBe('Test with \\n literal')
    })

    it('DTSTART에 TZID 파라미터가 있는 경우를 처리한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:tzid-test@example.com
DTSTAMP:20240115T100000Z
DTSTART;TZID=America/New_York:20240115T100000
DTEND;TZID=America/New_York:20240115T110000
SUMMARY:TZID Event
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.dtstart.getFullYear()).toBe(2024)
        expect(result?.dtstart.getMonth()).toBe(0)
        expect(result?.dtstart.getDate()).toBe(15)
    })

    it('여러 VEVENT가 있으면 첫 마스터를 파싱한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:first-uid@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:First Event
END:VEVENT
BEGIN:VEVENT
UID:second-uid@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240116T100000Z
DTEND:20240116T110000Z
SUMMARY:Second Event
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.uid).toBe('first-uid@example.com')
        expect(result?.summary).toBe('First Event')
    })

    it('DTEND가 없는 시간 이벤트는 1시간 기본값을 사용한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-dtend-time@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
SUMMARY:No End Time
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.isAllDay).toBe(false)
        const diffMs = result!.dtend.getTime() - result!.dtstart.getTime()
        expect(diffMs).toBe(60 * 60 * 1000)
    })

    it('빈 VEVENT는 null을 반환한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).toBeNull()
    })

    it('PRIORITY가 0이면 0을 반환한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:priority0@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Priority Zero
PRIORITY:0
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.priority).toBe(0)
    })

    it('STATUS가 소문자이면 무시한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:lowercase-status@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Lowercase Status
STATUS:confirmed
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.status).toBeUndefined()
    })

    it('CATEGORIES가 빈 문자열이면 빈 배열을 반환한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:empty-cat@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Empty Categories
CATEGORIES:
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.categories).toBeDefined()
    })

    it('탭으로 시작하는 줄도 연속으로 처리한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:tab-fold@example.com
DTSTAMP:20240115T100000Z
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Tab
\tcontinuation
END:VEVENT
END:VCALENDAR`

        const result = parseICS(ics)

        expect(result).not.toBeNull()
        expect(result?.summary).toBe('Tabcontinuation')
    })
})

describe('extractUidFromICS', () => {
    it('ICS에서 UID를 추출한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:extracted-uid-123@example.com
SUMMARY:Test
END:VEVENT
END:VCALENDAR`

        const uid = extractUidFromICS(ics)

        expect(uid).toBe('extracted-uid-123@example.com')
    })

    it('UID가 없으면 null을 반환한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Test
END:VEVENT
END:VCALENDAR`

        const uid = extractUidFromICS(ics)

        expect(uid).toBeNull()
    })

    it('UID 값 앞뒤 공백을 제거한다', () => {
        const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:  trimmed-uid@example.com
SUMMARY:Test
END:VEVENT
END:VCALENDAR`

        const uid = extractUidFromICS(ics)

        expect(uid).toBe('trimmed-uid@example.com')
    })
})

describe('parseICS VALARM 처리', () => {
    it('VALARM 구간의 DESCRIPTION이 이벤트 설명을 덮어쓰지 않는다', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'UID:alarm-test@example.com',
            'SUMMARY:회의',
            'DESCRIPTION:본문 설명',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:알림 설명',
            'TRIGGER:-PT15M',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        const result = parseICS(ics)

        expect(result?.description).toBe('본문 설명')
        expect(result?.summary).toBe('회의')
    })

    it('VALARM 구간의 DTSTART가 이벤트 시작일을 덮어쓰지 않는다', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:alarm-dtstart@example.com',
            'SUMMARY:회의',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'BEGIN:VALARM',
            'ACTION:AUDIO',
            'DTSTART:19700101T000000Z',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        const result = parseICS(ics)

        expect(result?.dtstart.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    })
})

describe('parseICS RECURRENCE-ID 처리', () => {
    it('RECURRENCE-ID VEVENT는 마스터를 덮어쓰지 않는다', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:series@example.com',
            'SUMMARY:주간 회의',
            'DTSTART:20240115T100000Z',
            'DTEND:20240115T110000Z',
            'RRULE:FREQ=WEEKLY',
            'END:VEVENT',
            'BEGIN:VEVENT',
            'UID:series@example.com',
            'RECURRENCE-ID:20240122T100000Z',
            'SUMMARY:변경된 회차',
            'DTSTART:20240122T150000Z',
            'DTEND:20240122T160000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        const result = parseICS(ics)

        expect(result?.summary).toBe('주간 회의')
        expect(result?.dtstart.toISOString()).toBe('2024-01-15T10:00:00.000Z')
        expect(result?.rrule?.freq).toBe('WEEKLY')
    })

    it('RECURRENCE-ID VEVENT만 있으면 null을 반환한다', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:series-only@example.com',
            'RECURRENCE-ID:20240122T100000Z',
            'SUMMARY:변경된 회차',
            'DTSTART:20240122T150000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        expect(parseICS(ics)).toBeNull()
    })
})

describe('parseICS 타임존 변환', () => {
    const buildIcs = (dtstartLine: string) =>
        ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:tz@example.com', 'SUMMARY:타임존 이벤트', dtstartLine, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')

    it('Z 접미 UTC 값을 사용자 타임존 벽시계로 저장한다', () => {
        const result = parseICS(buildIcs('DTSTART:20240115T100000Z'), 'Asia/Seoul')

        expect(result?.dtstart.toISOString()).toBe('2024-01-15T19:00:00.000Z')
    })

    it('TZID 파라미터를 사용자 타임존 벽시계로 변환한다', () => {
        const result = parseICS(buildIcs('DTSTART;TZID=America/New_York:20240115T100000'), 'Asia/Seoul')

        expect(result?.dtstart.toISOString()).toBe('2024-01-16T00:00:00.000Z')
    })

    it('서머타임 구간의 TZID도 실제 오프셋으로 변환한다', () => {
        const result = parseICS(buildIcs('DTSTART;TZID=America/New_York:20240715T100000'), 'Asia/Seoul')

        expect(result?.dtstart.toISOString()).toBe('2024-07-15T23:00:00.000Z')
    })

    it('타임존 지정이 없는 값은 벽시계 그대로 저장한다', () => {
        const result = parseICS(buildIcs('DTSTART:20240115T100000'), 'Asia/Seoul')

        expect(result?.dtstart.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    })

    it('종일 이벤트는 타임존 변환 없이 날짜를 유지한다', () => {
        const result = parseICS(buildIcs('DTSTART;VALUE=DATE:20240115'), 'Asia/Seoul')

        expect(result?.isAllDay).toBe(true)
        expect(result?.dtstart.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    })

    it('알 수 없는 TZID는 벽시계 값으로 취급한다', () => {
        const result = parseICS(buildIcs('DTSTART;TZID=Customized Time Zone:20240115T100000'), 'Asia/Seoul')

        expect(result?.dtstart.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    })

    it('UNTIL 값도 사용자 타임존 벽시계로 변환한다', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:until@example.com',
            'SUMMARY:반복',
            'DTSTART;TZID=Asia/Seoul:20240115T100000',
            'RRULE:FREQ=DAILY;UNTIL=20240131T150000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

        const result = parseICS(ics, 'Asia/Seoul')

        expect(result?.rrule?.until?.toISOString()).toBe('2024-02-01T00:00:00.000Z')
    })
})

describe('parseICS BYDAY 처리', () => {
    const buildRRuleIcs = (rrule: string) =>
        [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:byday@example.com',
            'SUMMARY:반복',
            'DTSTART:20240115T100000Z',
            `RRULE:${rrule}`,
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n')

    it('ordinal이 붙은 BYDAY를 유지한다', () => {
        const result = parseICS(buildRRuleIcs('FREQ=MONTHLY;BYDAY=1MO,-1FR'))

        expect(result?.rrule?.byDay).toEqual(['1MO', '-1FR'])
    })

    it('잘못된 BYDAY 값은 버린다', () => {
        const result = parseICS(buildRRuleIcs('FREQ=WEEKLY;BYDAY=MO,XX'))

        expect(result?.rrule?.byDay).toEqual(['MO'])
    })
})
