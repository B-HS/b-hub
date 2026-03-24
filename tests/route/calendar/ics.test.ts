import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarIcsRoute } from '../../../route/calendar/ics'

const mockSubscription = {
    id: 'sub-1',
    userId: 'user-1',
    token: 'caldav-token',
    icsToken: 'valid-ics-token',
    name: 'My Calendar',
    isActive: true,
    ctag: '0',
    lastAccessedAt: null,
}

const mockEvent = {
    uid: 'test-uid@b-calendar',
    summary: '회의',
    dtstart: new Date('2024-01-15T10:00:00Z'),
    dtend: new Date('2024-01-15T11:00:00Z'),
    isAllDay: false,
    sequence: 0,
    created: new Date('2024-01-15T10:00:00Z'),
    lastModified: new Date('2024-01-15T10:00:00Z'),
}

const createMockDeps = () => ({
    calendarService: {
        getSubscriptionByIcsToken: mock((token: string) => Promise.resolve(token === 'valid-ics-token' ? mockSubscription : null)),
        getAllEvents: mock(() => Promise.resolve([mockEvent])),
        getUserTimezone: mock(() => Promise.resolve('Asia/Seoul')),
    } as never,
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/calendar', createCalendarIcsRoute(deps))
    return { app, deps }
}

describe('GET /calendar/:icsToken', () => {
    test('유효한 토큰으로 ICS 피드를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
        expect(body).toContain('BEGIN:VEVENT')
    })

    test('.ics 확장자가 있어도 동작한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token.ics')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    })

    test('유효하지 않은 토큰이면 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/invalid-token')
        expect(res.status).toBe(404)
    })

    test('Content-Type이 text/calendar이다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token')
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    })

    test('Cache-Control 헤더를 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token')
        expect(res.status).toBe(200)
        const cacheControl = res.headers.get('Cache-Control')
        expect(cacheControl).toBeTruthy()
        expect(cacheControl).toContain('no-cache')
        expect(cacheControl).toContain('no-store')
    })

    test('Content-Disposition 헤더를 포함한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token')
        expect(res.status).toBe(200)
        const disposition = res.headers.get('Content-Disposition')
        expect(disposition).toBeTruthy()
        expect(disposition).toContain('attachment')
        expect(disposition).toContain('.ics')
    })

    test('이벤트가 없으면 빈 VCALENDAR을 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getAllEvents = mock(() => Promise.resolve([])) as never
        const { app } = createApp(deps)
        const res = await app.request('/calendar/valid-ics-token')
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body).toContain('BEGIN:VCALENDAR')
        expect(body).toContain('END:VCALENDAR')
        expect(body).not.toContain('BEGIN:VEVENT')
    })
})
