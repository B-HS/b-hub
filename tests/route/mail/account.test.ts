import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailAccountRoute } from '../../../route/mail/account'

const mockAccount = {
    id: 1,
    provider: 'gmail',
    email: 'test@gmail.com',
    displayName: null,
    isActive: true,
    lastSyncAt: new Date(),
    lastSyncStatus: 'success',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const createMockDeps = () => ({
    mailAccountService: {
        list: mock(() => Promise.resolve([mockAccount])),
        getById: mock((id: number) => {
            if (id === 1) return Promise.resolve(mockAccount)
            throw { code: 'MAIL_ACCOUNT_NOT_FOUND', message: '메일 계정을 찾을 수 없습니다', statusCode: 404 }
        }),
        create: mock(() => Promise.resolve({ id: 2 })),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
        testConnection: mock(() => Promise.resolve({ success: true })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/mail/accounts', createMailAccountRoute(deps))
    return { app, deps }
}

describe('GET /mail/accounts', () => {
    test('계정 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/accounts')
        expect(res.status).toBe(401)
    })
})

describe('GET /mail/accounts/:accountId', () => {
    test('계정 상세를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts/1')
        expect(res.status).toBe(200)
    })

    test('없는 계정은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts/999')
        expect(res.status).toBe(404)
    })
})

describe('POST /mail/accounts', () => {
    test('계정을 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'gmail', email: 'new@gmail.com' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })

    test('잘못된 요청은 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'invalid', email: 'bad' }),
        })
        expect(res.status).toBe(400)
    })
})

describe('PATCH /mail/accounts/:accountId', () => {
    test('계정을 수정한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'New Name' }),
        })
        expect(res.status).toBe(200)
    })
})

describe('DELETE /mail/accounts/:accountId', () => {
    test('계정을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
    })
})

describe('POST /mail/accounts/:accountId/test', () => {
    test('연결 테스트 결과를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/accounts/1/test', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.success).toBe(true)
    })
})
