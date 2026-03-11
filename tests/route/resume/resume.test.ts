import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createResumeRoute } from '../../../route/resume/resume'

const validResumeData = {
    name_furigana: 'ねこ',
    name: '猫',
    gender: '男',
    birthday_year: '平成7',
    birthday_month: '10',
    birthday_day: '10',
    age: '30',
    photo: '',
    contact: { furigana: 'test', postal: '100-0001', address: '東京都', phone: '099-9999', email: 'test@test.com' },
    emergency: { furigana: 'test', postal: '100-0002', address: '東京都', phone: '099-8888', email: '' },
    history: [],
    qualifications: [],
    self_promotion: '',
    commuting_hours: '1',
    commuting_minutes: '30',
    dependents: '0',
    marital_status: '無',
    spouse_obligation: '無',
    objective: '',
    creation_year: '令和8',
    creation_month: '3',
    creation_day: '11',
}

const mockResume = {
    id: 1,
    userId: 'user-1',
    type: 'resume',
    title: '내 이력서',
    data: validResumeData,
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createMockDeps = () => ({
    resumeService: {
        list: mock(() => Promise.resolve({ resumes: [mockResume], total: 1 })),
        getById: mock(() => Promise.resolve({ success: true as const, resume: mockResume })),
        create: mock(() => Promise.resolve({ id: 2 })),
        update: mock(() => Promise.resolve({ success: true as const })),
        delete: mock(() => Promise.resolve({ success: true as const })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/resume', createResumeRoute(deps))
    return { app, deps }
}

describe('GET /resume', () => {
    test('인증된 사용자의 이력서 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/resume')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(1)
        expect(body.pagination.total).toBe(1)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/resume')
        expect(res.status).toBe(401)
    })
})

describe('GET /resume/:id', () => {
    test('이력서 상세를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/resume/1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe(1)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/resume/1')
        expect(res.status).toBe(401)
    })
})

describe('POST /resume', () => {
    test('이력서를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'resume', title: '새 이력서', data: validResumeData }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe(2)
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'resume', title: '새 이력서', data: validResumeData }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /resume/:id', () => {
    test('이력서를 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/resume/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정된 이력서' }),
        })
        expect(res.status).toBe(200)
    })

    test('존재하지 않으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.resumeService.update = mock(() => Promise.resolve({ success: false as const, reason: 'not_found' as const }))
        const { app } = createApp(deps)
        const res = await app.request('/resume/999', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '수정' }),
        })
        expect(res.status).toBe(404)
    })

    test('다른 사용자의 이력서면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.resumeService.update = mock(() => Promise.resolve({ success: false as const, reason: 'not_owner' as const }))
        const { app } = createApp(deps)
        const res = await app.request('/resume/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '해킹' }),
        })
        expect(res.status).toBe(403)
    })
})

describe('DELETE /resume/:id', () => {
    test('이력서를 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/resume/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })

    test('존재하지 않으면 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.resumeService.delete = mock(() => Promise.resolve({ success: false as const, reason: 'not_found' as const }))
        const { app } = createApp(deps)
        const res = await app.request('/resume/999', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })

    test('다른 사용자의 이력서면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.resumeService.delete = mock(() => Promise.resolve({ success: false as const, reason: 'not_owner' as const }))
        const { app } = createApp(deps)
        const res = await app.request('/resume/1', { method: 'DELETE' })
        expect(res.status).toBe(403)
    })
})
