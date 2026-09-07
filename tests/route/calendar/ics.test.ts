import { afterEach, describe, expect, setSystemTime, test, mock } from 'bun:test'
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

describe('GET /calendar/:icsToken ETag (P-18)', () => {
    const CLOCK_SHIFT_MS = 60 * 1000

    afterEach(() => {
        setSystemTime()
    })

    test('약한 ETag 헤더를 함께 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token')

        expect(res.status).toBe(200)
        expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]{32}"$/)
        expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
        expect(res.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
        expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="My Calendar.ics"')
    })

    test('If-None-Match 가 일치하면 본문 없이 304 를 반환한다', async () => {
        const { app } = createApp()
        const first = await app.request('/calendar/valid-ics-token')
        const etag = first.headers.get('ETag')!

        const second = await app.request('/calendar/valid-ics-token', { headers: { 'If-None-Match': etag } })

        expect(second.status).toBe(304)
        expect(second.headers.get('ETag')).toBe(etag)
        expect(await second.text()).toBe('')
    })

    test('강한 형식·목록·와일드카드 If-None-Match 도 304 로 처리한다', async () => {
        const { app } = createApp()
        const etag = (await app.request('/calendar/valid-ics-token')).headers.get('ETag')!
        const strongEtag = etag.replace('W/', '')

        const strong = await app.request('/calendar/valid-ics-token', { headers: { 'If-None-Match': strongEtag } })
        const list = await app.request('/calendar/valid-ics-token', { headers: { 'If-None-Match': `"other", ${etag}` } })
        const wildcard = await app.request('/calendar/valid-ics-token', { headers: { 'If-None-Match': '*' } })

        expect(strong.status).toBe(304)
        expect(list.status).toBe(304)
        expect(wildcard.status).toBe(304)
    })

    test('If-None-Match 가 다르면 200 과 본문을 그대로 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/valid-ics-token', { headers: { 'If-None-Match': 'W/"stale-etag"' } })

        expect(res.status).toBe(200)
        expect(await res.text()).toContain('BEGIN:VEVENT')
    })

    test('DTSTAMP 만 달라지면 ETag 가 유지된다', async () => {
        const { app } = createApp()
        setSystemTime(new Date('2024-06-01T00:00:00Z'))
        const first = await app.request('/calendar/valid-ics-token')
        const firstBody = await first.text()

        setSystemTime(new Date(new Date('2024-06-01T00:00:00Z').getTime() + CLOCK_SHIFT_MS))
        const second = await app.request('/calendar/valid-ics-token')
        const secondBody = await second.text()

        expect(firstBody).not.toBe(secondBody)
        expect(second.headers.get('ETag')).toBe(first.headers.get('ETag'))
    })

    test('이벤트 내용이 바뀌면 ETag 가 달라진다', async () => {
        const { app } = createApp()
        const before = await app.request('/calendar/valid-ics-token')

        const changedDeps = createMockDeps()
        changedDeps.calendarService.getAllEvents = mock(() => Promise.resolve([{ ...mockEvent, summary: '변경된 회의' }])) as never
        const { app: changedApp } = createApp(changedDeps)
        const after = await changedApp.request('/calendar/valid-ics-token')

        expect(after.headers.get('ETag')).not.toBe(before.headers.get('ETag'))
    })

    test('구독이 없으면 If-None-Match 와 무관하게 404 이다', async () => {
        const { app } = createApp()
        const res = await app.request('/calendar/invalid-token', { headers: { 'If-None-Match': '*' } })

        expect(res.status).toBe(404)
    })
})
