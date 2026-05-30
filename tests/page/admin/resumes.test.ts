import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createResumesRoute } from '../../../page/admin/pages/resumes'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleRow = {
    id: 7,
    userId: 'u-1',
    userEmail: 'resume-owner@example.com',
    type: 'developer',
    title: 'Senior Engineer Resume',
    isPublic: true,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-02'),
}

const sampleDetail = {
    id: 7,
    userId: 'u-1',
    userEmail: 'resume-owner@example.com',
    type: 'developer',
    title: 'Senior Engineer Resume',
    isPublic: true,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-02'),
    data: { summary: 'hello-resume-json', skills: ['typescript', 'bun'] },
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/resumes',
        createResumesRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listResumes: () => Promise.resolve({ rows: [sampleRow], total: 1 }),
                getResume: (id) => Promise.resolve(id === sampleDetail.id ? sampleDetail : null),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/resumes (list)', () => {
    test('200과 제목/공개여부/작성일을 노출한다', async () => {
        const res = await createApp().request('/admin/resumes')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Senior Engineer Resume')
        expect(html).toContain('resume-owner@example.com')
        expect(html).toContain('public')
        expect(html).toContain('작성일')
        expect(html).toContain('1–1 / 1')
    })

    test('private 이력서는 private 뱃지를 노출한다', async () => {
        const res = await createApp({
            listResumes: () => Promise.resolve({ rows: [{ ...sampleRow, isPublic: false }], total: 1 }),
        }).request('/admin/resumes')
        const html = await res.text()
        expect(html).toContain('private')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/resumes?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })

    test('size는 최소 5로 클램프된다', async () => {
        const listResumes = mock(() => Promise.resolve({ rows: [sampleRow], total: 1 }))
        const res = await createApp({ listResumes }).request('/admin/resumes?size=1')
        expect(res.status).toBe(200)
        expect(listResumes.mock.calls[0][0].size).toBe(5)
    })

    test('size는 최대 100으로 클램프된다', async () => {
        const listResumes = mock(() => Promise.resolve({ rows: [sampleRow], total: 1 }))
        await createApp({ listResumes }).request('/admin/resumes?size=9999')
        expect(listResumes.mock.calls[0][0].size).toBe(100)
    })

    test('잘못된 page는 1로 폴백되며 크래시하지 않는다', async () => {
        const listResumes = mock(() => Promise.resolve({ rows: [sampleRow], total: 1 }))
        const res = await createApp({ listResumes }).request('/admin/resumes?page=abc')
        expect(res.status).toBe(200)
        expect(listResumes.mock.calls[0][0].page).toBe(1)
    })
})

describe('GET /admin/resumes/:id (detail)', () => {
    test('상세 페이지에 data JSON이 노출된다', async () => {
        const res = await createApp().request('/admin/resumes/7')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('hello-resume-json')
        expect(html).toContain('Senior Engineer Resume')
    })

    test('getResume가 null이면 404를 반환한다', async () => {
        const res = await createApp().request('/admin/resumes/999')
        expect(res.status).toBe(404)
    })

    test('id 0은 getResume를 호출하지 않고 404를 반환한다', async () => {
        const getResume = mock(() => Promise.resolve(sampleDetail))
        const res = await createApp({ getResume }).request('/admin/resumes/0')
        expect(res.status).toBe(404)
        expect(getResume).not.toHaveBeenCalled()
    })
})

describe('POST /admin/resumes/:id/visibility', () => {
    test('toggleResumeVisibility를 호출하고 flash=ok로 리다이렉트한다', async () => {
        const toggleResumeVisibility = mock(() => Promise.resolve())
        const app = createApp({ toggleResumeVisibility })
        const res = await app.request('/admin/resumes/7/visibility', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/resumes')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(toggleResumeVisibility).toHaveBeenCalledWith(7)
    })

    test('정상 returnTo는 그대로 적용된다', async () => {
        const app = createApp()
        const res = await app.request('/admin/resumes/7/visibility', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: '/admin/resumes?q=foo' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/resumes?q=foo')
        expect(res.headers.get('location')).toContain('flash=ok')
    })

    test('외부 도메인 returnTo는 무시되고 기본 경로로 폴백된다', async () => {
        const app = createApp()
        const res = await app.request('/admin/resumes/7/visibility', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toContain('/admin/resumes')
    })

    test('id 0은 toggle을 호출하지 않지만 303 리다이렉트한다', async () => {
        const toggleResumeVisibility = mock(() => Promise.resolve())
        const app = createApp({ toggleResumeVisibility })
        const res = await app.request('/admin/resumes/0/visibility', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(toggleResumeVisibility).not.toHaveBeenCalled()
    })
})

describe('POST /admin/resumes/:id/delete', () => {
    test('deleteResume를 호출하고 303으로 리다이렉트한다', async () => {
        const deleteResume = mock(() => Promise.resolve())
        const app = createApp({ deleteResume })
        const res = await app.request('/admin/resumes/7/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/resumes')
        expect(res.headers.get('location')).toContain('flash=ok')
        expect(deleteResume).toHaveBeenCalledWith(7)
    })

    test('외부 도메인 returnTo는 무시되고 기본 경로로 폴백된다', async () => {
        const app = createApp()
        const res = await app.request('/admin/resumes/7/delete', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com/admin' }),
        })
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toContain('/admin/resumes')
    })

    test('id 0은 deleteResume를 호출하지 않지만 303 리다이렉트한다', async () => {
        const deleteResume = mock(() => Promise.resolve())
        const app = createApp({ deleteResume })
        const res = await app.request('/admin/resumes/0/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteResume).not.toHaveBeenCalled()
    })
})
