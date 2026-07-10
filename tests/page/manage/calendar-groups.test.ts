import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageCalendarGroupsRoute } from '../../../page/manage/pages/calendar-groups'
import type { CalendarService } from '../../../service/domain/calendar/calendar'
import { mockUser, sessionOf, stubCalendarService } from './helpers'

const sampleGroup = {
    id: 'grp-1',
    userId: 'u1',
    name: '개인',
    color: '#3b82f6',
    sortOrder: 0,
    isVisible: true,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
}

const createApp = (overrides: Partial<CalendarService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/calendar/groups',
        createManageCalendarGroupsRoute({ getSession: sessionOf(mockUser), calendarService: stubCalendarService(overrides) }),
    )
    return app
}

describe('GET /manage/calendar/groups', () => {
    test('그룹 목록을 보여준다', async () => {
        const res = await createApp({ getGroups: () => Promise.resolve([sampleGroup]) as never }).request('/manage/calendar/groups')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('개인')
    })
})

describe('POST /manage/calendar/groups', () => {
    test('createGroup을 호출한다', async () => {
        const createGroup = mock(() => Promise.resolve(sampleGroup))
        const res = await createApp({ createGroup: createGroup as never }).request('/manage/calendar/groups', {
            method: 'POST',
            body: new URLSearchParams({ name: '업무', color: '#ff0000' }),
        })
        expect(res.status).toBe(303)
        expect(createGroup).toHaveBeenCalledWith('u1', { name: '업무', color: '#ff0000' })
    })

    test('삭제 시 이벤트가 있으면 conflict로 리다이렉트한다', async () => {
        const { createAppError } = await import('../../../lib/error')
        const deleteGroup = mock(() => Promise.reject(createAppError('CALENDAR_GROUP_HAS_EVENTS')))
        const res = await createApp({ deleteGroup: deleteGroup as never }).request('/manage/calendar/groups/grp-1/delete', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('code=conflict')
    })
})
