import { describe, expect, test } from 'bun:test'
import { createEventSchema, updateEventSchema, monthQuerySchema, recurrenceRuleSchema, dateRangeQuerySchema } from '../../../dto/calendar-event'

describe('createEventSchema', () => {
    test('필수 필드만으로 파싱한다', () => {
        const result = createEventSchema.safeParse({
            summary: '회의',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.summary).toBe('회의')
            expect(result.data.isAllDay).toBe(false)
        }
    })

    test('선택 필드를 포함하여 파싱한다', () => {
        const result = createEventSchema.safeParse({
            summary: '팀 미팅',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            isAllDay: true,
            description: '주간 회의',
            location: '3층 회의실',
            status: 'CONFIRMED',
            transp: 'OPAQUE',
            priority: 5,
            categories: ['업무'],
            color: '#FF0000',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.description).toBe('주간 회의')
            expect(result.data.location).toBe('3층 회의실')
            expect(result.data.status).toBe('CONFIRMED')
            expect(result.data.priority).toBe(5)
        }
    })

    test('rrule을 포함하여 파싱한다', () => {
        const result = createEventSchema.safeParse({
            summary: '반복 회의',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            rrule: { freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'] },
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.rrule?.freq).toBe('WEEKLY')
            expect(result.data.rrule?.interval).toBe(2)
        }
    })

    test('summary가 비어있으면 실패한다', () => {
        const result = createEventSchema.safeParse({
            summary: '',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    test('summary가 500자를 초과하면 실패한다', () => {
        const result = createEventSchema.safeParse({
            summary: 'a'.repeat(501),
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    test('유효하지 않은 status는 실패한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            status: 'INVALID',
        })
        expect(result.success).toBe(false)
    })

    test('priority가 범위를 벗어나면 실패한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            priority: 10,
        })
        expect(result.success).toBe(false)
    })

    test('날짜 문자열을 Date로 변환한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.dtstart).toBeInstanceOf(Date)
            expect(result.data.dtend).toBeInstanceOf(Date)
        }
    })

    test('dtstart만 있고 dtend가 없으면 거부한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    test('dtstart가 유효하지 않은 문자열이면 거부한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: 'not-a-date',
            dtend: '2024-01-15T11:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    test('description이 빈 문자열이면 허용한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            description: '',
        })
        expect(result.success).toBe(true)
    })

    test('categories 빈 배열을 허용한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            categories: [],
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.categories).toEqual([])
        }
    })

    test('groupId를 허용한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            groupId: 'group-uuid',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.groupId).toBe('group-uuid')
        }
    })

    test('groupId가 null이면 허용한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            groupId: null,
        })
        expect(result.success).toBe(true)
    })

    test('color 필드를 허용한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            color: '#FF0000',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.color).toBe('#FF0000')
        }
    })

    test('exdate 배열을 전달해도 성공한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            exdate: ['20240120T100000Z'],
        })
        expect(result.success).toBe(true)
    })

    test('알 수 없는 필드를 무시한다', () => {
        const result = createEventSchema.safeParse({
            summary: '테스트',
            dtstart: '2024-01-15T10:00:00Z',
            dtend: '2024-01-15T11:00:00Z',
            unknown: 123,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect((result.data as Record<string, unknown>).unknown).toBeUndefined()
        }
    })
})

describe('updateEventSchema', () => {
    test('부분 업데이트를 파싱한다', () => {
        const result = updateEventSchema.safeParse({
            summary: '변경된 제목',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.summary).toBe('변경된 제목')
        }
    })

    test('모든 필드가 선택적이다', () => {
        const result = updateEventSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('nullable 필드에 null을 허용한다', () => {
        const result = updateEventSchema.safeParse({
            description: null,
            location: null,
            rrule: null,
            status: null,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.description).toBeNull()
            expect(result.data.location).toBeNull()
        }
    })

    test('모든 필드가 없어도 유효하다', () => {
        const result = updateEventSchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('summary를 null로 설정할 수 없다', () => {
        const result = updateEventSchema.safeParse({
            summary: null,
        })
        expect(result.success).toBe(false)
    })

    test('rrule을 null로 설정할 수 있다', () => {
        const result = updateEventSchema.safeParse({
            rrule: null,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.rrule).toBeNull()
        }
    })

    test('exdate를 null로 설정할 수 있다', () => {
        const result = updateEventSchema.safeParse({
            exdate: null,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.exdate).toBeNull()
        }
    })
})

describe('monthQuerySchema', () => {
    test('유효한 년월을 파싱한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '0' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.year).toBe(2024)
            expect(result.data.month).toBe(0)
        }
    })

    test('month 11까지 허용한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '11' })
        expect(result.success).toBe(true)
    })

    test('month가 12 이상이면 실패한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '12' })
        expect(result.success).toBe(false)
    })

    test('4자리가 아닌 year는 실패한다', () => {
        const result = monthQuerySchema.safeParse({ year: '24', month: '0' })
        expect(result.success).toBe(false)
    })

    test('month가 -1이면 거부한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '-1' })
        expect(result.success).toBe(false)
    })

    test('year가 999면 거부한다', () => {
        const result = monthQuerySchema.safeParse({ year: '999', month: '0' })
        expect(result.success).toBe(false)
    })

    test('month가 12이면 거부한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '12' })
        expect(result.success).toBe(false)
    })

    test('year와 month를 숫자로 변환한다', () => {
        const result = monthQuerySchema.safeParse({ year: '2024', month: '6' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(typeof result.data.year).toBe('number')
            expect(result.data.year).toBe(2024)
            expect(typeof result.data.month).toBe('number')
            expect(result.data.month).toBe(6)
        }
    })
})

describe('recurrenceRuleSchema', () => {
    test('유효한 반복 규칙을 파싱한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'WEEKLY',
            interval: 2,
            byDay: ['MO', 'FR'],
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.freq).toBe('WEEKLY')
            expect(result.data.interval).toBe(2)
        }
    })

    test('유효하지 않은 freq는 실패한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'HOURLY',
        })
        expect(result.success).toBe(false)
    })

    test('freq만 필수이다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'DAILY',
        })
        expect(result.success).toBe(true)
    })

    test('until은 datetime 형식이어야 한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'MONTHLY',
            until: '2024-12-31T23:59:59Z',
        })
        expect(result.success).toBe(true)
    })

    test('byMonth 값은 1~12 범위여야 한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'YEARLY',
            byMonth: [0, 13],
        })
        expect(result.success).toBe(false)
    })

    test('interval이 0이면 거부한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'DAILY',
            interval: 0,
        })
        expect(result.success).toBe(false)
    })

    test('count가 0이면 거부한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'DAILY',
            count: 0,
        })
        expect(result.success).toBe(false)
    })

    test('byMonthDay가 32면 거부한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'MONTHLY',
            byMonthDay: [32],
        })
        expect(result.success).toBe(false)
    })

    test('byMonthDay가 0이면 거부한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'MONTHLY',
            byMonthDay: [0],
        })
        expect(result.success).toBe(false)
    })

    test('until이 유효한 날짜 문자열이면 허용한다', () => {
        const result = recurrenceRuleSchema.safeParse({
            freq: 'DAILY',
            until: '2024-12-31T00:00:00Z',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.until).toBe('2024-12-31T00:00:00Z')
        }
    })
})

describe('dateRangeQuerySchema', () => {
    test('유효한 날짜 범위를 파싱한다', () => {
        const result = dateRangeQuerySchema.safeParse({
            startDate: '2024-03-01',
            endDate: '2024-03-31',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.startDate).toBe('2024-03-01')
            expect(result.data.endDate).toBe('2024-03-31')
        }
    })

    test('groupId를 포함할 수 있다', () => {
        const result = dateRangeQuerySchema.safeParse({
            startDate: '2024-03-01',
            endDate: '2024-03-31',
            groupId: 'group-1',
        })
        expect(result.success).toBe(true)
    })

    test('startDate가 없으면 실패한다', () => {
        const result = dateRangeQuerySchema.safeParse({
            endDate: '2024-03-31',
        })
        expect(result.success).toBe(false)
    })

    test('유효하지 않은 날짜 형식은 실패한다', () => {
        const result = dateRangeQuerySchema.safeParse({
            startDate: '2024/03/01',
            endDate: '2024-03-31',
        })
        expect(result.success).toBe(false)
    })
})
