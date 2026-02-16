import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createWebhookRoute } from '../../../route/hn/webhook'

const adminSession = { user: { id: 'user-1', role: 'admin' } }
const userSession = { user: { id: 'user-2', role: 'user' } }

const createMockWebhookService = () => ({
    register: mock(() => Promise.resolve({ success: true })),
    remove: mock(() => Promise.resolve()),
    removeByUrl: mock(() => Promise.resolve({ deleted: true })),
    deactivate: mock(() => Promise.resolve()),
    test: mock(() => Promise.resolve({ sent: true })),
    list: mock(() => Promise.resolve([])),
    getById: mock(() => Promise.resolve(null)),
})

const createApp = (session: typeof adminSession | null = adminSession) => {
    const webhookService = createMockWebhookService()
    const getSession = mock(() => Promise.resolve(session))
    const app = new Hono()
    app.route('/webhooks', createWebhookRoute({ webhookService, getSession }))
    return { app, webhookService, getSession }
}

describe('POST /webhooks', () => {
    test('관리자가 웹훅을 등록한다', async () => {
        const { app } = createApp()
        const res = await app.request('/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://discord.com/api/webhooks/123' }),
        })
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(null)
        const res = await app.request('/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://discord.com/api/webhooks/123' }),
        })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const { app } = createApp(userSession)
        const res = await app.request('/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://discord.com/api/webhooks/123' }),
        })
        expect(res.status).toBe(403)
    })
})

describe('DELETE /webhooks/:id', () => {
    test('관리자가 웹훅을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/webhooks/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(null)
        const res = await app.request('/webhooks/1', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })
})

describe('POST /webhooks/delete-by-url', () => {
    test('관리자가 URL로 웹훅을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/webhooks/delete-by-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://discord.com/api/webhooks/123' }),
        })
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(null)
        const res = await app.request('/webhooks/delete-by-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://discord.com/api/webhooks/123' }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PATCH /webhooks/:id/deactivate', () => {
    test('관리자가 웹훅을 비활성화한다', async () => {
        const { app } = createApp()
        const res = await app.request('/webhooks/1/deactivate', {
            method: 'PATCH',
        })
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(null)
        const res = await app.request('/webhooks/1/deactivate', {
            method: 'PATCH',
        })
        expect(res.status).toBe(401)
    })
})

describe('POST /webhooks/:id/test', () => {
    test('관리자가 웹훅을 테스트한다', async () => {
        const { app } = createApp()
        const res = await app.request('/webhooks/1/test', { method: 'POST' })
        expect(res.status).toBe(200)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const { app } = createApp(null)
        const res = await app.request('/webhooks/1/test', { method: 'POST' })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const { app } = createApp(userSession)
        const res = await app.request('/webhooks/1/test', { method: 'POST' })
        expect(res.status).toBe(403)
    })
})
