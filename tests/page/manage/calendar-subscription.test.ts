import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageCalendarSubscriptionRoute } from '../../../page/manage/pages/calendar-subscription'
import type { CalendarService, CalendarSubscription } from '../../../service/domain/calendar/calendar'
import { mockUser, sessionOf, stubCalendarService } from './helpers'

const sampleSubscription: CalendarSubscription = {
    id: 'sub-1',
    userId: 'u1',
    token: 'caldav-token',
    icsToken: 'ics-token',
    name: 'Schedule',
    isActive: true,
    ctag: '0',
    lastAccessedAt: null,
}

const createApp = (overrides: Partial<CalendarService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/calendar/subscription',
        createManageCalendarSubscriptionRoute({
            getSession: sessionOf(mockUser),
            calendarService: stubCalendarService(overrides),
            baseUrl: 'https://hub.test',
        }),
    )
    return app
}

describe('GET /manage/calendar/subscription', () => {
    test('구독이 있으면 CalDAV/ICS URL을 노출한다', async () => {
        const res = await createApp({ getSubscription: () => Promise.resolve(sampleSubscription) }).request('/manage/calendar/subscription')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('https://hub.test/caldav/caldav-token/')
        expect(html).toContain('https://hub.test/api/calendar/ics-token')
    })

    test('구독이 없으면 생성 폼을 보여준다', async () => {
        const res = await createApp({ getSubscription: () => Promise.resolve(null) }).request('/manage/calendar/subscription')
        expect(await res.text()).toContain('구독 생성')
    })
})

describe('POST /manage/calendar/subscription', () => {
    test('토큰 재발급을 호출한다', async () => {
        const regenerateSubscriptionToken = mock(() => Promise.resolve('new-token'))
        const res = await createApp({ regenerateSubscriptionToken }).request('/manage/calendar/subscription/regenerate', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(regenerateSubscriptionToken).toHaveBeenCalledWith('u1')
    })
})
