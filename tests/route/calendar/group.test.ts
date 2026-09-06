import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarGroupRoute } from '../../../route/calendar/group'

const mockGroups = [
    { id: 'g1', userId: 'user-1', name: '개인', color: 'bg-blue-500', sortOrder: 0, isVisible: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'g2', userId: 'user-1', name: '업무', color: 'bg-red-500', sortOrder: 1, isVisible: true, createdAt: new Date(), updatedAt: new Date() },
]

const createMockCalendarService = () => ({
    getGroups: mock(() => Promise.resolve(mockGroups)),
    getGroupById: mock(() => Promise.resolve(mockGroups[0])),
    createGroup: mock(() =>
        Promise.resolve({ id: 'g-new', userId: 'user-1', name: '새 그룹', color: 'bg-green-500', sortOrder: 0, isVisible: true }),
    ),
    updateGroup: mock(() => Promise.resolve()),
    deleteGroup: mock(() => Promise.resolve()),
})

const createMockDeps = () => ({
    calendarService: createMockCalendarService(),
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } } as { user: { id: string; role: string | null } } | null)),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/groups', createCalendarGroupRoute(deps as never))
    return { app, deps }
}

describe('GET /groups', () => {
    test('인증된 사용자의 그룹 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(2)
        expect(body.data[0].name).toBe('개인')
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/groups')
        expect(res.status).toBe(401)
    })
})

describe('POST /groups', () => {
    test('그룹을 생성하고 201을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '새 그룹', color: 'bg-green-500' }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.data.name).toBe('새 그룹')
    })

    test('name이 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: 'bg-green-500' }),
        })
        expect(res.status).toBe(400)
    })

    test('color가 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '새 그룹' }),
        })
        expect(res.status).toBe(400)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '새 그룹', color: 'bg-green-500' }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /groups/:id', () => {
    test('그룹을 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '수정된 이름' }),
        })
        expect(res.status).toBe(200)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '수정' }),
        })
        expect(res.status).toBe(401)
    })

    test('존재하지 않는 그룹 수정 시 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.updateGroup = mock(() => {
            const err = { code: 'CALENDAR_GROUP_NOT_FOUND', message: '', statusCode: 404 }
            return Promise.reject(err)
        }) as never
        const { app } = createApp(deps)
        const res = await app.request('/groups/non-existent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '수정' }),
        })
        expect(res.status).toBe(404)
    })

    test('갱신 후 조회 결과가 없으면 data: null 대신 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null)) as never
        const { app } = createApp(deps)
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '수정' }),
        })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('CALENDAR_GROUP_NOT_FOUND')
    })

    test('갱신된 행을 그대로 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve({ ...mockGroups[0], name: '수정된 이름' })) as never
        const { app } = createApp(deps)
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '수정된 이름' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.id).toBe('g1')
        expect(body.data.name).toBe('수정된 이름')
    })

    test('color만 수정할 수 있다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: 'bg-green-500' }),
        })
        expect(res.status).toBe(200)
    })

    test('sortOrder와 isVisible을 수정할 수 있다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups/g1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: 5, isVisible: false }),
        })
        expect(res.status).toBe(200)
    })
})

describe('DELETE /groups/:id', () => {
    test('그룹을 삭제하고 204를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/groups/g1', { method: 'DELETE' })
        expect(res.status).toBe(204)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/groups/g1', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })

    test('존재하지 않는 그룹 삭제 시 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.deleteGroup = mock(() => {
            const err = { code: 'CALENDAR_GROUP_NOT_FOUND', message: '', statusCode: 404 }
            return Promise.reject(err)
        }) as never
        const { app } = createApp(deps)
        const res = await app.request('/groups/non-existent', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })

    test('이벤트가 있는 그룹 삭제 시 409를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.deleteGroup = mock(() => {
            const err = { code: 'CALENDAR_GROUP_HAS_EVENTS', message: '', statusCode: 409 }
            return Promise.reject(err)
        }) as never
        const { app } = createApp(deps)
        const res = await app.request('/groups/g1', { method: 'DELETE' })
        expect(res.status).toBe(409)
    })
})
