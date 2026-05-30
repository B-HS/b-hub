import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailRoute } from '../../../page/admin/pages/mail'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleAccount = {
    id: 7,
    userId: 'u-1',
    userEmail: 'owner@example.com',
    provider: 'gmail',
    email: 'owner@gmail.com',
    isActive: true,
    lastSyncAt: new Date('2026-05-01'),
    lastSyncStatus: 'completed',
    createdAt: new Date('2026-04-01'),
}

const sampleSyncLog = {
    id: 11,
    accountId: 7,
    syncType: 'full',
    status: 'completed',
    messagesAdded: 5,
    messagesUpdated: 2,
    messagesDeleted: 1,
    durationMs: 1234,
    errorMessage: null,
    createdAt: new Date('2026-05-02'),
}

const sampleSyncSession = {
    id: 21,
    accountId: 7,
    folderId: 3,
    syncType: 'incremental',
    status: 'running',
    syncedCount: 10,
    totalEstimate: 100,
    startedAt: new Date('2026-05-03'),
    lastBatchAt: new Date('2026-05-03'),
}

const sampleMessage = {
    id: 31,
    accountId: 7,
    folderId: 3,
    subject: 'Quarterly report',
    fromAddress: { name: 'Boss', address: 'boss@example.com' },
    receivedAt: new Date('2026-05-04'),
    isRead: false,
    hasAttachments: true,
}

const sampleUpload = {
    id: 41,
    userId: 'u-1',
    userEmail: 'owner@example.com',
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 54321,
    r2Key: 'mail/uploads/abc.pdf',
    isInline: false,
    createdAt: new Date('2026-05-05'),
}

const createApp = (
    overrides: Parameters<typeof stubAdminDb>[0] = {},
    extraDeps: { triggerMailSync?: (id: number) => Promise<void> } = {},
) => {
    const app = new Hono()
    app.route(
        '/admin/mail',
        createMailRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listMailAccounts: () => Promise.resolve({ rows: [sampleAccount], total: 1 }),
                listMailSyncLogs: () => Promise.resolve({ rows: [sampleSyncLog], total: 1 }),
                listMailSyncSessions: () => Promise.resolve({ rows: [sampleSyncSession], total: 1 }),
                listMailMessages: () => Promise.resolve({ rows: [sampleMessage], total: 1 }),
                listMailUploads: () => Promise.resolve({ rows: [sampleUpload], total: 1 }),
                ...overrides,
            }),
            ...extraDeps,
        }),
    )
    return app
}

describe('GET /admin/mail/accounts (list)', () => {
    test('200과 계정 이메일/토글·동기화 버튼을 보여준다', async () => {
        const res = await createApp().request('/admin/mail/accounts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('owner@gmail.com')
        expect(html).toContain('owner@example.com')
        expect(html).toContain('동기화')
        expect(html).toContain('비활성')
        expect(html).toContain('1–1 / 1')
    })

    test('q 쿼리가 필터바에 prefill 된다', async () => {
        const res = await createApp().request('/admin/mail/accounts?q=foo')
        const html = await res.text()
        expect(html).toContain('value="foo"')
    })

    test('size는 5~100 범위로 clamp 된다', async () => {
        const listMailAccounts = mock(() => Promise.resolve({ rows: [sampleAccount], total: 1 }))
        const app = createApp({ listMailAccounts })
        await app.request('/admin/mail/accounts?size=1')
        expect(listMailAccounts.mock.calls[0][0].size).toBe(5)
        await app.request('/admin/mail/accounts?size=9999')
        expect(listMailAccounts.mock.calls[1][0].size).toBe(100)
    })

    test('잘못된 page는 1로 fallback 되고 크래시하지 않는다', async () => {
        const listMailAccounts = mock(() => Promise.resolve({ rows: [sampleAccount], total: 1 }))
        const app = createApp({ listMailAccounts })
        const res = await app.request('/admin/mail/accounts?page=abc')
        expect(res.status).toBe(200)
        expect(listMailAccounts.mock.calls[0][0].page).toBe(1)
    })
})

describe('POST /admin/mail/accounts/:id/toggle', () => {
    test('toggleMailAccount(int)를 호출하고 303 flash=ok로 리다이렉트한다', async () => {
        const toggleMailAccount = mock(() => Promise.resolve())
        const app = createApp({ toggleMailAccount })
        const res = await app.request('/admin/mail/accounts/7/toggle', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/mail/accounts?flash=ok')
        expect(toggleMailAccount).toHaveBeenCalledWith(7)
    })

    test('id가 0이면 toggle을 호출하지 않지만 303은 응답한다', async () => {
        const toggleMailAccount = mock(() => Promise.resolve())
        const app = createApp({ toggleMailAccount })
        const res = await app.request('/admin/mail/accounts/0/toggle', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(toggleMailAccount).not.toHaveBeenCalled()
    })

    test('비숫자 id는 toggle을 호출하지 않는다', async () => {
        const toggleMailAccount = mock(() => Promise.resolve())
        const app = createApp({ toggleMailAccount })
        const res = await app.request('/admin/mail/accounts/abc/toggle', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(toggleMailAccount).not.toHaveBeenCalled()
    })
})

describe('POST /admin/mail/accounts/:id/sync', () => {
    test('triggerMailSync(id)를 호출하고 303 flash=ok로 리다이렉트한다', async () => {
        const triggerMailSync = mock((_id: number) => Promise.resolve())
        const app = createApp({}, { triggerMailSync })
        const res = await app.request('/admin/mail/accounts/7/sync', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/mail/accounts?flash=ok')
        expect(triggerMailSync).toHaveBeenCalledWith(7)
    })

    test('triggerMailSync가 throw하면 flash=err로 리다이렉트한다', async () => {
        const triggerMailSync = mock((_id: number) => Promise.reject(new Error('boom')))
        const app = createApp({}, { triggerMailSync })
        const res = await app.request('/admin/mail/accounts/7/sync', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
    })

    test('triggerMailSync 의존성이 없어도 303 flash=ok로 크래시 없이 응답한다', async () => {
        const app = createApp()
        const res = await app.request('/admin/mail/accounts/7/sync', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/mail/accounts?flash=ok')
    })

    test('id가 0이면 triggerMailSync를 호출하지 않는다', async () => {
        const triggerMailSync = mock((_id: number) => Promise.resolve())
        const app = createApp({}, { triggerMailSync })
        const res = await app.request('/admin/mail/accounts/0/sync', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(triggerMailSync).not.toHaveBeenCalled()
    })
})

describe('GET /admin/mail/sync-logs (list)', () => {
    test('200과 동기화 로그를 보여준다', async () => {
        const res = await createApp().request('/admin/mail/sync-logs')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('completed')
        expect(html).toContain('1–1 / 1')
    })

    test('accountId/status 필터가 prefill 되고 db로 전달된다', async () => {
        const listMailSyncLogs = mock(() => Promise.resolve({ rows: [sampleSyncLog], total: 1 }))
        const app = createApp({ listMailSyncLogs })
        const res = await app.request('/admin/mail/sync-logs?accountId=7&status=failed')
        const html = await res.text()
        expect(html).toContain('value="7"')
        expect(html).toContain('value="failed"')
        const arg = listMailSyncLogs.mock.calls[0][0]
        expect(arg.accountId).toBe(7)
        expect(arg.status).toBe('failed')
    })
})

describe('GET /admin/mail/sync-sessions (list)', () => {
    test('200과 진행 중 세션을 보여준다', async () => {
        const res = await createApp().request('/admin/mail/sync-sessions')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('running')
        expect(html).toContain('10 / 100')
        expect(html).toContain('1–1 / 1')
    })

    test('status 필터가 prefill 된다', async () => {
        const res = await createApp().request('/admin/mail/sync-sessions?status=running')
        const html = await res.text()
        expect(html).toContain('value="running"')
    })
})

describe('GET /admin/mail/messages (list)', () => {
    test('200과 메일 subject/from을 보여준다', async () => {
        const res = await createApp().request('/admin/mail/messages')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('Quarterly report')
        expect(html).toContain('boss@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('accountId/q/folderId/isRead/hasAttachments 필터가 prefill 되고 db로 전달된다', async () => {
        const listMailMessages = mock(() => Promise.resolve({ rows: [sampleMessage], total: 1 }))
        const app = createApp({ listMailMessages })
        const res = await app.request('/admin/mail/messages?accountId=7&q=report&folderId=3&isRead=n&hasAttachments=y')
        const html = await res.text()
        expect(html).toContain('value="7"')
        expect(html).toContain('value="report"')
        expect(html).toContain('value="3"')
        const arg = listMailMessages.mock.calls[0][0]
        expect(arg.accountId).toBe(7)
        expect(arg.q).toBe('report')
        expect(arg.folderId).toBe(3)
        expect(arg.isRead).toBe('n')
        expect(arg.hasAttachments).toBe('y')
    })
})

describe('GET /admin/mail/uploads (list)', () => {
    test('200과 r2Key 컬럼이 렌더링된다', async () => {
        const res = await createApp().request('/admin/mail/uploads')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('R2 key')
        expect(html).toContain('mail/uploads/abc.pdf')
        expect(html).toContain('invoice.pdf')
        expect(html).toContain('1–1 / 1')
    })

    test('q 필터가 prefill 된다', async () => {
        const res = await createApp().request('/admin/mail/uploads?q=invoice')
        const html = await res.text()
        expect(html).toContain('value="invoice"')
    })
})

describe('POST /admin/mail/uploads/:id/delete', () => {
    test('deleteMailUpload(int)를 호출하고 303 flash=ok로 리다이렉트한다', async () => {
        const deleteMailUpload = mock(() => Promise.resolve())
        const app = createApp({ deleteMailUpload })
        const res = await app.request('/admin/mail/uploads/41/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/mail/uploads?flash=ok')
        expect(deleteMailUpload).toHaveBeenCalledWith(41)
    })

    test('id가 0이면 deleteMailUpload를 호출하지 않지만 303은 응답한다', async () => {
        const deleteMailUpload = mock(() => Promise.resolve())
        const app = createApp({ deleteMailUpload })
        const res = await app.request('/admin/mail/uploads/0/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteMailUpload).not.toHaveBeenCalled()
    })
})
