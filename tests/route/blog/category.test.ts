import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createCategoryRoute } from '../../../route/blog/category'

const createMockDb = () => ({
    getCategoryList: mock(() => Promise.resolve([{ categoryId: 1, category: 'Tech', isHide: false }])),
    createCategory: mock((category: string) => Promise.resolve({ categoryId: 2, category, isHide: false })),
})

const adminSession = { user: { id: 'user-1', role: 'admin' } }
const userSession = { user: { id: 'user-2', role: 'user' } }

const createApp = (db = createMockDb(), session: typeof adminSession | null = adminSession) => {
    const app = new Hono()
    const getSession = mock(() => Promise.resolve(session))
    app.route('/blog/categories', createCategoryRoute({ db, getSession }))
    return { app, db, getSession }
}

describe('GET /blog/categories', () => {
    test('카테고리 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/categories')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.categories).toHaveLength(1)
    })
})

describe('POST /blog/categories', () => {
    test('관리자가 카테고리를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'DevOps' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.category).toBe('DevOps')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(createMockDb(), null)
        const res = await app.request('/blog/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'DevOps' }),
        })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const { app } = createApp(createMockDb(), userSession)
        const res = await app.request('/blog/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'DevOps' }),
        })
        expect(res.status).toBe(403)
    })

    test('빈 카테고리명은 에러를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: '' }),
        })
        expect(res.status).not.toBe(200)
    })
})
