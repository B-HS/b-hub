import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createTagRoute } from '../../../route/blog/tag'

const createMockDb = () => ({
    getTagList: mock(() => Promise.resolve([{ tagId: 1, tag: 'TypeScript' }])),
    createTag: mock((tag: string) => Promise.resolve({ tagId: 2, tag })),
})

const adminSession = { user: { id: 'user-1', role: 'admin' } }
const userSession = { user: { id: 'user-2', role: 'user' } }

const createApp = (db = createMockDb(), session: typeof adminSession | null = adminSession) => {
    const app = new Hono()
    const getSession = mock(() => Promise.resolve(session))
    app.route('/blog/tags', createTagRoute({ db, getSession }))
    return { app, db, getSession }
}

describe('GET /blog/tags', () => {
    test('태그 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/tags')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.tags).toHaveLength(1)
    })
})

describe('POST /blog/tags', () => {
    test('관리자가 태그를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: 'React' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.tag).toBe('React')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(createMockDb(), null)
        const res = await app.request('/blog/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: 'React' }),
        })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const { app } = createApp(createMockDb(), userSession)
        const res = await app.request('/blog/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: 'React' }),
        })
        expect(res.status).toBe(403)
    })
})
