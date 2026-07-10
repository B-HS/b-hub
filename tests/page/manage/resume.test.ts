import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageResumeRoute } from '../../../page/manage/pages/resume'
import type { ResumeService } from '../../../service/domain/resume/resume'
import { mockUser, sessionOf, stubResumeService } from './helpers'

const sampleResume = {
    id: 4,
    userId: 'u1',
    type: 'resume',
    title: '내 이력서',
    data: { name: 'kim' },
    isPublic: false,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
}

const createApp = (overrides: Partial<ResumeService> = {}) => {
    const app = new Hono()
    app.route('/manage/resume', createManageResumeRoute({ getSession: sessionOf(mockUser), resumeService: stubResumeService(overrides) }))
    return app
}

describe('GET /manage/resume', () => {
    test('이력서 목록을 보여준다', async () => {
        const res = await createApp({ list: () => Promise.resolve({ resumes: [sampleResume], total: 1 }) as never }).request('/manage/resume')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('내 이력서')
    })
})

describe('POST /manage/resume', () => {
    test('data JSON이 유효하지 않으면 검증 실패한다', async () => {
        const create = mock(() => Promise.resolve({ id: 1 }))
        const res = await createApp({ create: create as never }).request('/manage/resume', {
            method: 'POST',
            body: new URLSearchParams({ type: 'resume', title: 't', data: 'not-json{' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
        expect(create).not.toHaveBeenCalled()
    })
})

describe('POST /manage/resume/:id/delete', () => {
    test('delete를 호출한다', async () => {
        const del = mock(() => Promise.resolve({ success: true as const }))
        const res = await createApp({ delete: del as never }).request('/manage/resume/4/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(del).toHaveBeenCalledWith(4, 'u1')
    })

    test('없는 이력서면 not_found로 리다이렉트한다', async () => {
        const del = mock(() => Promise.resolve({ success: false as const, reason: 'not_found' as const }))
        const res = await createApp({ delete: del as never }).request('/manage/resume/4/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('code=not_found')
    })
})
