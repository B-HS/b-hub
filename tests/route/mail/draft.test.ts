import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailDraftRoute } from '../../../route/mail/draft'

const mockDraft = (overrides = {}) => ({
    id: 100,
    accountId: 1,
    folderId: 9,
    remoteMessageId: 'local-draft:uuid-1',
    messageIdHeader: null,
    threadId: null,
    inReplyTo: null,
    referencesHeader: null,
    fromAddress: { name: 'Me', address: 'me@test.com' },
    toAddresses: [{ name: 'To', address: 'to@test.com' }],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Draft',
    bodyHtml: '<p>Draft</p>',
    bodyText: 'Draft',
    snippet: 'Draft',
    isRead: true,
    isStarred: false,
    isDraft: true,
    hasAttachments: false,
    sentAt: null,
    receivedAt: new Date(),
    uid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
})

const createMockDeps = () => ({
    mailDraftService: {
        createDraft: mock(() => Promise.resolve(mockDraft())),
        updateDraft: mock(() => Promise.resolve(mockDraft({ subject: 'Updated' }))),
        deleteDraft: mock(() => Promise.resolve({ deleted: true })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'user', image: null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/mail/drafts', createMailDraftRoute(deps))
    return { app, deps }
}

describe('POST /mail/drafts', () => {
    test('임시보관 메일을 생성한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1, to: [{ name: 'To', address: 'to@test.com' }], subject: 'Draft', bodyHtml: '<p>Draft</p>' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.id).toBe(100)
        expect(body.data.isDraft).toBe(true)
        expect(body.data.toAddresses).toHaveLength(1)
        expect(body.data.references).toBeNull()
        expect(deps.mailDraftService.createDraft).toHaveBeenCalledWith('user-1', expect.objectContaining({ accountId: 1, subject: 'Draft' }))
    })

    test('accountId만으로도 생성한다(빈 recipients 기본값)', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1 }),
        })
        expect(res.status).toBe(200)
    })

    test('accountId가 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'no account' }),
        })
        expect(res.status).toBe(400)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: 1 }),
        })
        expect(res.status).toBe(401)
    })
})

describe('PUT /mail/drafts/:id', () => {
    test('임시보관 메일을 수정한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/drafts/100', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'Updated' }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.subject).toBe('Updated')
        expect(deps.mailDraftService.updateDraft).toHaveBeenCalledWith('user-1', 100, expect.objectContaining({ subject: 'Updated' }))
    })

    test('빈 바디도 허용한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/drafts/100', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(200)
    })

    test('없는 draft는 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.mailDraftService.updateDraft = mock(() => Promise.reject({ code: 'MAIL_MESSAGE_NOT_FOUND', message: 'x', statusCode: 404 }))
        const { app } = createApp(deps)
        const res = await app.request('/mail/drafts/999', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'x' }),
        })
        expect(res.status).toBe(404)
    })

    test('잘못된 id는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/drafts/abc', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'x' }),
        })
        expect(res.status).toBe(400)
    })
})

describe('DELETE /mail/drafts/:id', () => {
    test('임시보관 메일을 삭제한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/mail/drafts/100', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.deleted).toBe(true)
        expect(deps.mailDraftService.deleteDraft).toHaveBeenCalledWith('user-1', 100)
    })

    test('없는 draft는 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.mailDraftService.deleteDraft = mock(() => Promise.reject({ code: 'MAIL_MESSAGE_NOT_FOUND', message: 'x', statusCode: 404 }))
        const { app } = createApp(deps)
        const res = await app.request('/mail/drafts/999', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })

    test('음수 id는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/mail/drafts/-1', { method: 'DELETE' })
        expect(res.status).toBe(400)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/mail/drafts/100', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })
})
