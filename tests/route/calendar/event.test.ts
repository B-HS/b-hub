import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCalendarEventRoute } from '../../../route/calendar/event'

const now = new Date('2024-01-15T10:00:00Z')
const later = new Date('2024-01-15T11:00:00Z')

const mockEvent = {
    uid: 'test-uid@b-calendar',
    summary: '회의',
    description: '팀 미팅',
    location: '3층',
    dtstart: now,
    dtend: later,
    isAllDay: false,
    sequence: 0,
    created: now,
    lastModified: now,
}

const mockGroup = {
    id: 'group-1',
    userId: 'user-1',
    name: '개인',
    color: 'bg-blue-500',
    sortOrder: 0,
    isVisible: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createMockCalendarService = () => ({
    getEventsByMonth: mock(() => Promise.resolve([mockEvent])),
    getEventsByDateRange: mock(() => Promise.resolve([mockEvent])),
    createEvent: mock(() => Promise.resolve(mockEvent)),
    getEventByUid: mock((_userId: string, _uid: string) => Promise.resolve(mockEvent as typeof mockEvent | null)),
    updateEvent: mock(() => Promise.resolve({ ...mockEvent, sequence: 1 })),
    deleteEvent: mock(() => Promise.resolve()),
    getGroupById: mock((_userId: string, _groupId: string) => Promise.resolve(mockGroup as typeof mockGroup | null)),
})

const createMockDeps = () => ({
    calendarService: createMockCalendarService(),
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } } as { user: { id: string; role: string | null } } | null)),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/events', createCalendarEventRoute(deps as never))
    return { app, deps }
}

describe('GET /events', () => {
    test('인증된 사용자의 월별 이벤트를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events?year=2024&month=0')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(1)
        expect(body.data[0].uid).toBe('test-uid@b-calendar')
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events?year=2024&month=0')
        expect(res.status).toBe(401)
    })
})

describe('POST /events', () => {
    test('이벤트를 생성하고 201을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '새 회의',
                dtstart: '2024-01-15T10:00:00Z',
                dtend: '2024-01-15T11:00:00Z',
            }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.data.uid).toBe('test-uid@b-calendar')
    })

    test('필수 필드가 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '' }),
        })
        expect(res.status).toBe(400)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '새 회의',
                dtstart: '2024-01-15T10:00:00Z',
                dtend: '2024-01-15T11:00:00Z',
            }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PUT /events/:uid', () => {
    test('이벤트를 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '수정된 회의' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.sequence).toBe(1)
    })

    test('존재하지 않는 이벤트면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/nonexistent', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '수정' }),
        })
        expect(res.status).toBe(404)
    })
})

describe('DELETE /events/:uid', () => {
    test('이벤트를 삭제하고 204를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', { method: 'DELETE' })
        expect(res.status).toBe(204)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })

    test('이벤트가 없어도 204를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.deleteEvent = mock(() => Promise.resolve())
        const { app } = createApp(deps)
        const res = await app.request('/events/nonexistent-uid', { method: 'DELETE' })
        expect(res.status).toBe(204)
    })
})

describe('GET /events 유효성 검증', () => {
    test('year가 누락되면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events?month=0')
        expect(res.status).toBe(400)
    })

    test('month가 범위 밖이면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events?year=2024&month=12')
        expect(res.status).toBe(400)
    })

    test('이벤트가 없으면 빈 배열을 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventsByMonth = mock(() => Promise.resolve([]))
        const { app } = createApp(deps)
        const res = await app.request('/events?year=2024&month=0')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(0)
    })
})

describe('POST /events 유효성 검증', () => {
    test('dtstart가 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '새 회의',
                dtend: '2024-01-15T11:00:00Z',
            }),
        })
        expect(res.status).toBe(400)
    })

    test('rrule이 포함된 이벤트를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '주간 회의',
                dtstart: '2024-01-15T10:00:00Z',
                dtend: '2024-01-15T11:00:00Z',
                rrule: { freq: 'WEEKLY', interval: 1 },
            }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.data.uid).toBe('test-uid@b-calendar')
    })
})

describe('PUT /events/:uid 추가 케이스', () => {
    test('부분 업데이트를 처리한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.updateEvent = mock(() =>
            Promise.resolve({
                ...mockEvent,
                summary: '수정된 회의',
                sequence: 1,
            }),
        )
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '수정된 회의' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.summary).toBe('수정된 회의')
        expect(body.data.description).toBe('팀 미팅')
        expect(body.data.location).toBe('3층')
    })

    test('인증 없이 요청하면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '수정' }),
        })
        expect(res.status).toBe(401)
    })

    test('sequence가 자동 증가한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: '수정된 회의' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.sequence).toBe(1)
    })
})

describe('GET /events/range', () => {
    test('날짜 범위로 이벤트를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/range?startDate=2024-01-01&endDate=2024-01-31')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(1)
        expect(body.data[0].title).toBe('회의')
        expect(body.data[0].startDate).toBeDefined()
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/range?startDate=2024-01-01&endDate=2024-01-31')
        expect(res.status).toBe(401)
    })

    test('startDate가 endDate보다 크면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/range?startDate=2024-02-01&endDate=2024-01-01')
        expect(res.status).toBe(400)
    })

    test('날짜 형식이 잘못되면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/range?startDate=invalid&endDate=2024-01-31')
        expect(res.status).toBe(400)
    })

    test('날짜 범위가 366일을 초과하면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/range?startDate=2024-01-01&endDate=2026-01-01')
        expect(res.status).toBe(400)
    })

    test('존재하지 않는 groupId로 필터링하면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/range?startDate=2024-01-01&endDate=2024-01-31&groupId=non-existent')
        expect(res.status).toBe(404)
    })

    test('유효한 groupId로 필터링하면 200을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/range?startDate=2024-01-01&endDate=2024-01-31&groupId=group-1')
        expect(res.status).toBe(200)
    })
})

describe('GET /events/detail/:uid', () => {
    test('단일 이벤트를 프론트엔드 포맷으로 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/detail/test-uid')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.title).toBe('회의')
        expect(body.data.uid).toBe('test-uid@b-calendar')
        expect(body.data.startDate).toBeDefined()
    })

    test('존재하지 않는 이벤트면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/detail/nonexistent')
        expect(res.status).toBe(404)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/detail/test-uid')
        expect(res.status).toBe(401)
    })
})

describe('POST /events/create', () => {
    test('프론트엔드 포맷으로 이벤트를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '새 회의',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
                startTime: '10:00',
                endTime: '11:00',
                isAllDay: false,
            }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.data.title).toBeDefined()
    })

    test('종일 이벤트를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '종일 이벤트',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
                isAllDay: true,
            }),
        })
        expect(res.status).toBe(201)
    })

    test('title이 비어있으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
            }),
        })
        expect(res.status).toBe(400)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '회의',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
            }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /events/:uid', () => {
    test('이벤트를 부분 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정된 회의' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.title).toBeDefined()
    })

    test('존재하지 않는 이벤트면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getEventByUid = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/nonexistent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정' }),
        })
        expect(res.status).toBe(404)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정' }),
        })
        expect(res.status).toBe(401)
    })

    test('날짜만 변경할 수 있다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2024-02-01' }),
        })
        expect(res.status).toBe(200)
    })

    test('groupId를 null로 설정할 수 있다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: null }),
        })
        expect(res.status).toBe(200)
    })
})

describe('groupId 소유 검증', () => {
    test('POST /events 에서 남의 그룹이면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '새 회의',
                dtstart: '2024-01-15T10:00:00Z',
                dtend: '2024-01-15T11:00:00Z',
                groupId: 'other-user-group',
            }),
        })
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error.code).toBe('CALENDAR_GROUP_NOT_FOUND')
        expect(deps.calendarService.createEvent).not.toHaveBeenCalled()
    })

    test('POST /events/create 에서 남의 그룹이면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '새 회의',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
                groupId: 'other-user-group',
            }),
        })
        expect(res.status).toBe(404)
        expect(deps.calendarService.createEvent).not.toHaveBeenCalled()
    })

    test('PUT /events/:uid 에서 남의 그룹이면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: 'other-user-group' }),
        })
        expect(res.status).toBe(404)
        expect(deps.calendarService.updateEvent).not.toHaveBeenCalled()
    })

    test('PATCH /events/:uid 에서 남의 그룹이면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.calendarService.getGroupById = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: 'other-user-group' }),
        })
        expect(res.status).toBe(404)
        expect(deps.calendarService.updateEvent).not.toHaveBeenCalled()
    })

    test('PATCH /events/:uid 에서 groupId를 보내지 않으면 그룹을 조회하지 않는다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정된 회의' }),
        })
        expect(res.status).toBe(200)
        expect(deps.calendarService.getGroupById).not.toHaveBeenCalled()
    })

    test('자신의 그룹이면 생성에 성공한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '새 회의',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
                groupId: 'group-1',
            }),
        })
        expect(res.status).toBe(201)
        expect(deps.calendarService.getGroupById).toHaveBeenCalledWith('user-1', 'group-1')
    })
})

describe('dtend/dtstart 역전 검증', () => {
    test('POST /events 에서 dtend가 dtstart보다 빠르면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: '회의',
                dtstart: '2024-01-15T11:00:00Z',
                dtend: '2024-01-15T10:00:00Z',
            }),
        })
        expect(res.status).toBe(400)
    })

    test('POST /events/create 에서 endDate가 startDate보다 빠르면 400을 반환한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '회의',
                startDate: '2024-01-16',
                endDate: '2024-01-15',
            }),
        })
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(deps.calendarService.createEvent).not.toHaveBeenCalled()
    })

    test('POST /events/create 에서 같은 날 endTime이 startTime보다 빠르면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '회의',
                startDate: '2024-01-15',
                endDate: '2024-01-15',
                startTime: '11:00',
                endTime: '10:00',
            }),
        })
        expect(res.status).toBe(400)
    })

    test('PUT /events/:uid 에서 dtend가 dtstart보다 빠르면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dtstart: '2024-01-15T11:00:00Z', dtend: '2024-01-15T10:00:00Z' }),
        })
        expect(res.status).toBe(400)
    })

    test('PATCH /events/:uid 에서 두 날짜를 모두 보내고 역전되면 400을 반환한다', async () => {
        const deps = createMockDeps()
        const { app } = createApp(deps)
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2024-02-02', endDate: '2024-02-01' }),
        })
        expect(res.status).toBe(400)
        expect(deps.calendarService.updateEvent).not.toHaveBeenCalled()
    })

    test('PATCH /events/:uid 에서 startDate만 보내면 병합 결과를 검증하지 않는다', async () => {
        const { app } = createApp()
        const res = await app.request('/events/test-uid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: '2024-02-01' }),
        })
        expect(res.status).toBe(200)
    })
})
