import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarRoute } from '../../../page/admin/pages/calendar'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleGroup = {
    id: 'group-0123456789abcdef',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    name: '업무 캘린더',
    color: '#ff8800',
    sortOrder: 2,
    isVisible: true,
    createdAt: new Date('2026-05-01'),
}

const sampleEvent = {
    id: 'event-1',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    summary: '주간 회의',
    dtstart: new Date('2026-05-10T01:00:00Z'),
    dtend: new Date('2026-05-10T02:00:00Z'),
    status: 'CONFIRMED',
    groupId: 'group-0123456789abcdef',
    groupName: '업무 캘린더',
    isAllDay: false,
}

const sampleSub = {
    id: 'sub-1',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    name: '구글 캘린더 구독',
    token: 'abcdefghijklmnop',
    isActive: true,
    lastAccessedAt: new Date('2026-05-20'),
    ctag: 'ctag-zeta-999',
    createdAt: new Date('2026-05-01'),
}

const sampleDeleted = {
    id: 'del-1',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    uid: 'event-uid-removed',
    deletedAt: new Date('2026-05-21'),
    syncToken: 'synctoken-0123456789abcdef',
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/calendar',
        createCalendarRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listCalendarGroups: () => Promise.resolve({ rows: [sampleGroup], total: 1 }),
                listCalendarEvents: () => Promise.resolve({ rows: [sampleEvent], total: 1 }),
                listCalendarSubscriptions: () => Promise.resolve({ rows: [sampleSub], total: 1 }),
                listDeletedCalendarEvents: () => Promise.resolve({ rows: [sampleDeleted], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/calendar/groups (list)', () => {
    test('200과 그룹 이름/색상/사용자 이메일을 보여준다', async () => {
        const res = await createApp().request('/admin/calendar/groups')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('업무 캘린더')
        expect(html).toContain('#ff8800')
        expect(html).toContain('owner@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('hex 색상은 인라인 style 스와치로 렌더링된다', async () => {
        const html = await (await createApp().request('/admin/calendar/groups')).text()
        expect(html).toContain('background:#ff8800')
    })

    test('hex 가 아닌 색상은 인라인 style 로 렌더링되지 않는다', async () => {
        const injected = { ...sampleGroup, color: 'red;background-image:url(javascript:alert(1))' }
        const app = createApp({ listCalendarGroups: mock(() => Promise.resolve({ rows: [injected], total: 1 })) })
        const html = await (await app.request('/admin/calendar/groups')).text()
        expect(html).not.toContain('background:red')
        expect(html).not.toContain('color-dot')
    })

    test('size가 최소값(5) 미만이면 5로 clamp 된다', async () => {
        const listCalendarGroups = mock(() => Promise.resolve({ rows: [sampleGroup], total: 1 }))
        const app = createApp({ listCalendarGroups })
        await app.request('/admin/calendar/groups?size=1')
        expect(listCalendarGroups).toHaveBeenCalledWith({ page: 1, size: 5 })
    })

    test('size가 최대값(100)을 넘으면 100으로 clamp 된다', async () => {
        const listCalendarGroups = mock(() => Promise.resolve({ rows: [sampleGroup], total: 1 }))
        const app = createApp({ listCalendarGroups })
        await app.request('/admin/calendar/groups?size=9999')
        expect(listCalendarGroups).toHaveBeenCalledWith({ page: 1, size: 100 })
    })

    test('잘못된 page는 1로 fallback 한다', async () => {
        const listCalendarGroups = mock(() => Promise.resolve({ rows: [sampleGroup], total: 1 }))
        const app = createApp({ listCalendarGroups })
        const res = await app.request('/admin/calendar/groups?page=abc')
        expect(res.status).toBe(200)
        expect(listCalendarGroups.mock.calls[0][0].page).toBe(1)
    })
})

describe('GET /admin/calendar/events (list)', () => {
    test('200과 summary/그룹 이름을 보여준다', async () => {
        const res = await createApp().request('/admin/calendar/events')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('주간 회의')
        expect(html).toContain('업무 캘린더')
        expect(html).toContain('1–1 / 1')
    })

    test('q/userId/from/to 필터가 폼에 prefill 된다', async () => {
        const res = await createApp().request('/admin/calendar/events?q=meeting&userId=u-9&from=2026-05-01&to=2026-05-31')
        const html = await res.text()
        expect(html).toContain('value="meeting"')
        expect(html).toContain('value="u-9"')
        expect(html).toContain('value="2026-05-01"')
        expect(html).toContain('value="2026-05-31"')
    })

    test('필터 쿼리가 db 호출에 전달된다', async () => {
        const listCalendarEvents = mock(() => Promise.resolve({ rows: [sampleEvent], total: 1 }))
        const app = createApp({ listCalendarEvents })
        await app.request('/admin/calendar/events?q=meeting&userId=u-9')
        const arg = listCalendarEvents.mock.calls[0][0]
        expect(arg.q).toBe('meeting')
        expect(arg.userId).toBe('u-9')
    })
})

describe('GET /admin/calendar/subscriptions (list)', () => {
    test('200과 ctag 컬럼이 렌더되고 token이 마스킹된다', async () => {
        const res = await createApp().request('/admin/calendar/subscriptions')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('ctag-zeta-999')
        expect(html).toContain('abcd…mnop')
        expect(html).not.toContain('abcdefghijklmnop')
        expect(html).toContain('구글 캘린더 구독')
    })
})

describe('POST /admin/calendar/subscriptions/:id/revoke', () => {
    test('구독을 취소하고 flash=ok로 리다이렉트한다', async () => {
        const revokeCalendarSubscription = mock(() => Promise.resolve())
        const app = createApp({ revokeCalendarSubscription })
        const res = await app.request('/admin/calendar/subscriptions/sub-1/revoke', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/calendar/subscriptions?flash=ok')
        expect(revokeCalendarSubscription).toHaveBeenCalledWith('sub-1')
    })

    test('returnTo가 외부 URL이어도 무시되고 기본 경로로 리다이렉트한다', async () => {
        const revokeCalendarSubscription = mock(() => Promise.resolve())
        const app = createApp({ revokeCalendarSubscription })
        const res = await app.request('/admin/calendar/subscriptions/sub-1/revoke', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location')
        expect(location).not.toContain('evil.com')
        expect(location).toContain('/admin/calendar/subscriptions?flash=ok')
    })
})

describe('GET /admin/calendar/deleted (list)', () => {
    test('200과 uid/syncToken 일부가 렌더된다', async () => {
        const res = await createApp().request('/admin/calendar/deleted')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('event-uid-removed')
        expect(html).toContain('synctoken-01…')
        expect(html).toContain('owner@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('size가 최대값(200)을 넘으면 200으로 clamp 된다', async () => {
        const listDeletedCalendarEvents = mock(() => Promise.resolve({ rows: [sampleDeleted], total: 1 }))
        const app = createApp({ listDeletedCalendarEvents })
        await app.request('/admin/calendar/deleted?size=9999')
        expect(listDeletedCalendarEvents).toHaveBeenCalledWith({ page: 1, size: 200 })
    })
})
