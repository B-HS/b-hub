import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageCalendarEventsRoute } from '../../../page/manage/pages/calendar-events'
import type { CalendarService, CalendarEvent } from '../../../service/domain/calendar/calendar'
import { mockUser, sessionOf, stubCalendarService } from './helpers'

const sampleEvent: CalendarEvent = {
    uid: 'evt-1',
    summary: '회의',
    dtstart: new Date('2026-06-01T09:00:00Z'),
    dtend: new Date('2026-06-01T10:00:00Z'),
    isAllDay: false,
    sequence: 0,
}

const createApp = (overrides: Partial<CalendarService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/calendar/events',
        createManageCalendarEventsRoute({ getSession: sessionOf(mockUser), calendarService: stubCalendarService(overrides) }),
    )
    return app
}

describe('GET /manage/calendar/events', () => {
    test('이벤트 목록을 보여준다', async () => {
        const res = await createApp({ getAllEvents: () => Promise.resolve([sampleEvent]) }).request('/manage/calendar/events')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('회의')
    })
})

describe('POST /manage/calendar/events', () => {
    test('유효한 입력이면 createEvent를 호출한다', async () => {
        const createEvent = mock(() => Promise.resolve(sampleEvent))
        const res = await createApp({ createEvent: createEvent as never }).request('/manage/calendar/events', {
            method: 'POST',
            body: new URLSearchParams({ summary: '새 일정', dtstart: '2026-06-01T09:00', dtend: '2026-06-01T10:00' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/calendar/events?flash=ok')
        expect(createEvent).toHaveBeenCalledTimes(1)
    })

    test('날짜가 없으면 검증 실패한다', async () => {
        const createEvent = mock(() => Promise.resolve(sampleEvent))
        const res = await createApp({ createEvent: createEvent as never }).request('/manage/calendar/events', {
            method: 'POST',
            body: new URLSearchParams({ summary: '새 일정' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
        expect(createEvent).not.toHaveBeenCalled()
    })
})

describe('POST /manage/calendar/events/:uid/delete', () => {
    test('deleteEvent를 호출한다', async () => {
        const deleteEvent = mock(() => Promise.resolve())
        const res = await createApp({ deleteEvent }).request('/manage/calendar/events/evt-1/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteEvent).toHaveBeenCalledWith('u1', 'evt-1')
    })
})
