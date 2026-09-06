import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarSubscriptionRoute } from '../../../route/calendar/subscription'

const mockSubscription = {
    id: 'sub-1',
    userId: 'user-1',
    token: 'caldav-token-abc',
    icsToken: 'ics-token-xyz',
    name: 'My Calendar',
    isActive: true,
    ctag: '0',
    lastAccessedAt: null,
}

const createMockDeps = () => ({
    calendarService: {
        getSubscription: mock(() => Promise.resolve(mockSubscription)),
        createSubscription: mock(() => Promise.resolve(mockSubscription)),
        regenerateSubscriptionToken: mock(() => Promise.resolve('new-caldav-token')),
        regenerateIcsToken: mock(() => Promise.resolve('new-ics-token')),
    } as never,
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
    baseUrl: 'https://api.gumyo.net',
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/subscription', createCalendarSubscriptionRoute(deps))
    return { app, deps }
}

describe('GET /subscription', () => {
    test('구독 정보를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.token).toBe('caldav-token-abc')
        expect(body.data.icsToken).toBe('ics-token-xyz')
        expect(body.data.caldavUrl).toBe('https://api.gumyo.net/caldav/caldav-token-abc/')
        expect(body.data.icsUrl).toBe('https://api.gumyo.net/api/calendar/ics-token-xyz')
    })

    test('구독이 없으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getSubscription = mock(() => Promise.resolve(null)) as never
        const { app } = createApp(deps)
        const res = await app.request('/subscription')
        expect(res.status).toBe(404)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/subscription')
        expect(res.status).toBe(401)
    })
})

describe('POST /subscription', () => {
    test('구독을 생성한다 (멱등)', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.token).toBe('caldav-token-abc')
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(401)
    })
})

describe('POST /subscription/regenerate', () => {
    test('CalDAV 토큰을 재생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription/regenerate', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.token).toBe('new-caldav-token')
    })
})

describe('POST /subscription/regenerate 구독 미존재', () => {
    test('구독이 없으면 404 CALENDAR_SUBSCRIPTION_NOT_FOUND 를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.regenerateSubscriptionToken = mock(() =>
            Promise.reject({ code: 'CALENDAR_SUBSCRIPTION_NOT_FOUND', message: '구독을 찾을 수 없습니다', statusCode: 404 }),
        ) as never
        const { app } = createApp(deps)
        const res = await app.request('/subscription/regenerate', { method: 'POST' })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('CALENDAR_SUBSCRIPTION_NOT_FOUND')
    })
})

describe('POST /subscription/regenerate-ics', () => {
    test('ICS 토큰을 재생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription/regenerate-ics', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.icsToken).toBe('new-ics-token')
    })

    test('인증 없이 요청하면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/subscription/regenerate-ics', { method: 'POST' })
        expect(res.status).toBe(401)
    })
})

describe('POST /subscription/regenerate-ics 구독 미존재', () => {
    test('구독이 없으면 404 CALENDAR_SUBSCRIPTION_NOT_FOUND 를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.regenerateIcsToken = mock(() =>
            Promise.reject({ code: 'CALENDAR_SUBSCRIPTION_NOT_FOUND', message: '구독을 찾을 수 없습니다', statusCode: 404 }),
        ) as never
        const { app } = createApp(deps)
        const res = await app.request('/subscription/regenerate-ics', { method: 'POST' })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('CALENDAR_SUBSCRIPTION_NOT_FOUND')
    })
})

describe('GET /subscription URL 형식', () => {
    test('caldavUrl과 icsUrl이 올바른 형식이다', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.caldavUrl).toContain('https://api.gumyo.net')
        expect(body.data.caldavUrl).toContain('caldav-token-abc')
        expect(body.data.caldavUrl).toMatch(/\/caldav\/caldav-token-abc\/$/)
        expect(body.data.icsUrl).toContain('https://api.gumyo.net')
        expect(body.data.icsUrl).toContain('ics-token-xyz')
    })
})

describe('POST /subscription name 필드', () => {
    test('name 필드를 전달하면 저장된다', async () => {
        const deps = createMockDeps()
        deps.calendarService.createSubscription = mock(() => Promise.resolve({ ...mockSubscription, name: '업무 캘린더' })) as never
        const { app } = createApp(deps)
        const res = await app.request('/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '업무 캘린더' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.name).toBe('업무 캘린더')
    })
})

describe('POST /subscription/regenerate 인증 및 응답', () => {
    test('인증 없이 요청하면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/subscription/regenerate', { method: 'POST' })
        expect(res.status).toBe(401)
    })

    test('새 토큰을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/subscription/regenerate', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveProperty('token')
        expect(typeof body.data.token).toBe('string')
        expect(body.data.token).toBe('new-caldav-token')
    })
})
