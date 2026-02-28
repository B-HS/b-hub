import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailFolderRoute } from '../../../route/mail/folder'

const mockFolders = [
    { id: 1, accountId: 1, name: 'INBOX', type: 'inbox', parentId: null, messageCount: 10, unreadCount: 3 },
    { id: 2, accountId: 1, name: 'Sent', type: 'sent', parentId: null, messageCount: 5, unreadCount: 0 },
]

const createMockDeps = () => ({
    db: {
        getFoldersByAccount: mock((accountId: number) => {
            if (accountId === 1) return Promise.resolve(mockFolders)
            return Promise.resolve([])
        }),
    },
    mailAccountService: {
        getById: mock((accountId: number) => {
            if (accountId === 1) return Promise.resolve({ id: 1 })
            throw { code: 'MAIL_ACCOUNT_NOT_FOUND', message: '메일 계정을 찾을 수 없습니다', statusCode: 404 }
        }),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/mail/folders', createMailFolderRoute(deps))
    return { app, deps }
}

describe('GET /mail/folders', () => {
    test('폴더 목록을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/folders?accountId=1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data).toHaveLength(2)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/folders?accountId=1')
        expect(res.status).toBe(401)
    })

    test('accountId 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/folders')
        expect(res.status).toBe(400)
    })

    test('존재하지 않는 계정은 404를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/folders?accountId=999')
        expect(res.status).toBe(404)
    })
})
