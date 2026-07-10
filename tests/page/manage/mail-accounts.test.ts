import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageMailAccountsRoute } from '../../../page/manage/pages/mail-accounts'
import type { MailAccountService } from '../../../service/domain/mail/mail-account'
import { mockUser, sessionOf, stubMailAccountService } from './helpers'

const sampleAccount = {
    id: 3,
    userId: 'u1',
    provider: 'gmail',
    email: 'me@example.com',
    displayName: '내 메일',
    credentials: 'ENCRYPTED-SECRET',
    isActive: true,
    lastSyncAt: new Date('2026-05-01'),
    lastSyncStatus: 'ok',
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
}

const createApp = (overrides: Partial<MailAccountService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/mail/accounts',
        createManageMailAccountsRoute({ getSession: sessionOf(mockUser), mailAccountService: stubMailAccountService(overrides) }),
    )
    return app
}

describe('GET /manage/mail/accounts', () => {
    test('계정 목록을 보여주고 암호화된 credentials는 노출하지 않는다', async () => {
        const res = await createApp({ list: () => Promise.resolve([sampleAccount]) as never }).request('/manage/mail/accounts')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('me@example.com')
        expect(html).not.toContain('ENCRYPTED-SECRET')
    })

    test('Gmail OAuth 연결 링크를 노출한다', async () => {
        const html = await (await createApp().request('/manage/mail/accounts')).text()
        expect(html).toContain('/api/mail/accounts/connect/google')
    })
})

describe('POST /manage/mail/accounts', () => {
    test('IMAP 자격증명으로 create를 호출한다', async () => {
        const create = mock(() => Promise.resolve({ id: 9 }))
        const res = await createApp({ create: create as never }).request('/manage/mail/accounts', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'imap', email: 'x@y.com', password: 'app-pass', imapHost: 'imap.y.com', imapPort: '993' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('/manage/mail/accounts?flash=ok')
        expect(create).toHaveBeenCalledTimes(1)
    })

    test('이메일이 없으면 검증 실패로 리다이렉트한다', async () => {
        const create = mock(() => Promise.resolve({ id: 9 }))
        const res = await createApp({ create: create as never }).request('/manage/mail/accounts', {
            method: 'POST',
            body: new URLSearchParams({ provider: 'imap' }),
        })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
        expect(create).not.toHaveBeenCalled()
    })
})

describe('POST /manage/mail/accounts/:id/(test|delete)', () => {
    test('연결 테스트를 호출한다', async () => {
        const testConnection = mock(() => Promise.resolve({ success: true }))
        const res = await createApp({ testConnection: testConnection as never }).request('/manage/mail/accounts/3/test', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(testConnection).toHaveBeenCalledWith(3, 'u1')
    })

    test('remove를 호출한다', async () => {
        const remove = mock(() => Promise.resolve())
        const res = await createApp({ remove }).request('/manage/mail/accounts/3/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(remove).toHaveBeenCalledWith(3, 'u1')
    })
})
