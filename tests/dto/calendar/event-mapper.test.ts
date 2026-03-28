import { describe, expect, test } from 'bun:test'
import { createEventBodySchema, patchEventBodySchema, toEventInput, toEventPatch, toEventResponse } from '../../../dto/calendar-event-mapper'
import { dateRangeQuerySchema } from '../../../dto/calendar-event'
import type { CalendarEvent } from '../../../service/domain/calendar/calendar'

describe('createEventBodySchema', () => {
    test('유효한 입력을 파싱한다', () => {
        const result = createEventBodySchema.safeParse({
            title: '회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00',
            endTime: '15:30',
            isAllDay: false,
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.title).toBe('회의')
            expect(result.data.startDate).toBe('2024-03-15')
        }
    })

    test('종일 이벤트는 time 필드가 없어도 된다', () => {
        const result = createEventBodySchema.safeParse({
            title: '종일 이벤트',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            isAllDay: true,
        })
        expect(result.success).toBe(true)
    })

    test('title이 비어있으면 실패한다', () => {
        const result = createEventBodySchema.safeParse({
            title: '',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
        })
        expect(result.success).toBe(false)
    })

    test('날짜 형식이 잘못되면 실패한다', () => {
        const result = createEventBodySchema.safeParse({
            title: '회의',
            startDate: '2024/03/15',
            endDate: '2024-03-15',
        })
        expect(result.success).toBe(false)
    })

    test('시간 형식이 잘못되면 실패한다', () => {
        const result = createEventBodySchema.safeParse({
            title: '회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00:00',
        })
        expect(result.success).toBe(false)
    })

    test('groupId를 포함할 수 있다', () => {
        const result = createEventBodySchema.safeParse({
            title: '회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            groupId: 'group-uuid',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.groupId).toBe('group-uuid')
        }
    })
})

describe('patchEventBodySchema', () => {
    test('모든 필드가 선택적이다', () => {
        const result = patchEventBodySchema.safeParse({})
        expect(result.success).toBe(true)
    })

    test('title만 수정할 수 있다', () => {
        const result = patchEventBodySchema.safeParse({ title: '수정된 제목' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.title).toBe('수정된 제목')
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
    })

    test('groupId를 포함할 수 있다', () => {
        const result = dateRangeQuerySchema.safeParse({
            startDate: '2024-03-01',
            endDate: '2024-03-31',
            groupId: 'group-1',
        })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.groupId).toBe('group-1')
        }
    })

    test('유효하지 않은 날짜 형식은 실패한다', () => {
        const result = dateRangeQuerySchema.safeParse({
            startDate: '2024/03/01',
            endDate: '2024-03-31',
        })
        expect(result.success).toBe(false)
    })

    test('startDate가 없으면 실패한다', () => {
        const result = dateRangeQuerySchema.safeParse({
            endDate: '2024-03-31',
        })
        expect(result.success).toBe(false)
    })
})

describe('toEventInput', () => {
    test('title을 summary로 변환한다', () => {
        const result = toEventInput({
            title: '회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00',
            endTime: '15:30',
            isAllDay: false,
        })
        expect(result.summary).toBe('회의')
        expect(result.dtstart).toBeInstanceOf(Date)
        expect(result.dtend).toBeInstanceOf(Date)
    })

    test('종일 이벤트는 로컬 자정으로 설정한다', () => {
        const result = toEventInput({
            title: '종일',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            isAllDay: true,
        })
        expect(result.dtstart.getFullYear()).toBe(2024)
        expect(result.dtstart.getMonth()).toBe(2)
        expect(result.dtstart.getDate()).toBe(15)
        expect(result.dtstart.getHours()).toBe(0)
        expect(result.dtstart.getMinutes()).toBe(0)
    })

    test('시간 이벤트는 로컬 시간으로 설정한다', () => {
        const result = toEventInput({
            title: '회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00',
            endTime: '15:30',
            isAllDay: false,
        })
        expect(result.dtstart.getHours()).toBe(14)
        expect(result.dtstart.getMinutes()).toBe(0)
        expect(result.dtend.getHours()).toBe(15)
        expect(result.dtend.getMinutes()).toBe(30)
    })
})

describe('toEventPatch', () => {
    const existing: CalendarEvent = {
        uid: 'test-uid@b-calendar',
        summary: '기존 회의',
        description: '기존 설명',
        location: '기존 장소',
        dtstart: new Date('2024-03-15T14:00:00'),
        dtend: new Date('2024-03-15T15:30:00'),
        isAllDay: false,
        sequence: 1,
    }

    test('title만 변경하면 summary만 바뀐다', () => {
        const result = toEventPatch(existing, { title: '수정된 회의' })
        expect(result.summary).toBe('수정된 회의')
        expect(result.dtstart).toEqual(existing.dtstart)
        expect(result.dtend).toEqual(existing.dtend)
    })

    test('startDate만 변경할 수 있다', () => {
        const result = toEventPatch(existing, { startDate: '2024-03-20' })
        expect(result.dtstart.getDate()).toBe(20)
        expect(result.dtstart.getHours()).toBe(14)
    })

    test('변경하지 않은 필드는 기존 값을 유지한다', () => {
        const result = toEventPatch(existing, {})
        expect(result.summary).toBe('기존 회의')
        expect(result.description).toBe('기존 설명')
        expect(result.location).toBe('기존 장소')
    })
})

describe('toEventResponse', () => {
    test('Date를 로컬 날짜/시간 문자열로 변환한다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '회의',
            dtstart: new Date('2024-03-15T14:00:00'),
            dtend: new Date('2024-03-15T15:30:00'),
            isAllDay: false,
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.title).toBe('회의')
        expect(result.startDate).toBe('2024-03-15')
        expect(result.startTime).toBe('14:00')
        expect(result.endTime).toBe('15:30')
    })

    test('종일 이벤트는 time 필드가 undefined이다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '종일 이벤트',
            dtstart: new Date('2024-03-15T00:00:00'),
            dtend: new Date('2024-03-15T00:00:00'),
            isAllDay: true,
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.startDate).toBe('2024-03-15')
        expect(result.endDate).toBe('2024-03-15')
        expect(result.startTime).toBeUndefined()
        expect(result.endTime).toBeUndefined()
    })

    test('groupId가 없으면 null을 반환한다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '테스트',
            dtstart: new Date('2024-03-15T14:00:00'),
            dtend: new Date('2024-03-15T15:00:00'),
            isAllDay: false,
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.groupId).toBeNull()
    })

    test('groupId가 있으면 반환한다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '테스트',
            dtstart: new Date('2024-03-15T14:00:00'),
            dtend: new Date('2024-03-15T15:00:00'),
            isAllDay: false,
            groupId: 'group-1',
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.groupId).toBe('group-1')
    })

    test('rrule이 있으면 변환한다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '반복 회의',
            dtstart: new Date('2024-03-15T14:00:00Z'),
            dtend: new Date('2024-03-15T15:00:00Z'),
            isAllDay: false,
            rrule: { freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'] },
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.rrule).toBeDefined()
        expect(result.rrule?.freq).toBe('WEEKLY')
        expect(result.rrule?.interval).toBe(2)
        expect(result.rrule?.byDay).toEqual(['MO', 'WE'])
    })

    test('status를 소문자로 변환한다', () => {
        const event: CalendarEvent = {
            uid: 'test-uid@b-calendar',
            summary: '테스트',
            dtstart: new Date('2024-03-15T14:00:00Z'),
            dtend: new Date('2024-03-15T15:00:00Z'),
            isAllDay: false,
            status: 'CONFIRMED',
            sequence: 0,
        }
        const result = toEventResponse(event)
        expect(result.status).toBe('confirmed')
    })
})

describe('toEventInput rrule 변환', () => {
    test('rrule을 포함한 이벤트를 변환한다', () => {
        const result = toEventInput({
            title: '반복 회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00',
            endTime: '15:00',
            isAllDay: false,
            rrule: { freq: 'MONTHLY', interval: 1, count: 12 },
        })
        expect(result.rrule?.freq).toBe('MONTHLY')
        expect(result.rrule?.count).toBe(12)
    })

    test('rrule until을 Date로 변환한다', () => {
        const result = toEventInput({
            title: '반복 회의',
            startDate: '2024-03-15',
            endDate: '2024-03-15',
            startTime: '14:00',
            endTime: '15:00',
            isAllDay: false,
            rrule: { freq: 'WEEKLY', until: '2024-12-31T23:59:59Z' },
        })
        expect(result.rrule?.until).toBeInstanceOf(Date)
    })
})

describe('toEventPatch 추가 케이스', () => {
    const existing: CalendarEvent = {
        uid: 'test-uid@b-calendar',
        summary: '기존 회의',
        description: '기존 설명',
        location: '기존 장소',
        dtstart: new Date('2024-03-15T14:00:00Z'),
        dtend: new Date('2024-03-15T15:30:00Z'),
        isAllDay: false,
        groupId: 'group-1',
        status: 'CONFIRMED',
        sequence: 1,
    }

    test('groupId를 null로 설정할 수 있다', () => {
        const result = toEventPatch(existing, { groupId: null })
        expect(result.groupId).toBeNull()
    })

    test('groupId를 변경할 수 있다', () => {
        const result = toEventPatch(existing, { groupId: 'group-2' })
        expect(result.groupId).toBe('group-2')
    })

    test('isAllDay를 true로 변경하면 기존 날짜는 유지된다', () => {
        const result = toEventPatch(existing, { isAllDay: true })
        expect(result.isAllDay).toBe(true)
        expect(result.dtstart.getUTCFullYear()).toBe(2024)
        expect(result.dtstart.getUTCMonth()).toBe(2)
        expect(result.dtstart.getUTCDate()).toBe(15)
    })

    test('endTime만 변경할 수 있다', () => {
        const result = toEventPatch(existing, { endTime: '17:00' })
        expect(result.dtend.getUTCHours()).toBe(17)
        expect(result.dtend.getUTCMinutes()).toBe(0)
    })

    test('description을 undefined로 유지한다', () => {
        const result = toEventPatch(existing, { title: '변경' })
        expect(result.description).toBe('기존 설명')
    })

    test('rrule을 추가할 수 있다', () => {
        const result = toEventPatch(existing, { rrule: { freq: 'DAILY', interval: 1 } })
        expect(result.rrule?.freq).toBe('DAILY')
    })

    test('rrule을 제거할 수 있다 (undefined)', () => {
        const existingWithRrule: CalendarEvent = {
            ...existing,
            rrule: { freq: 'WEEKLY', interval: 1 },
        }
        const result = toEventPatch(existingWithRrule, { rrule: undefined })
        expect(result.rrule?.freq).toBe('WEEKLY')
    })
})
