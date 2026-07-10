import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageMailSyncRoute } from '../../../page/manage/pages/mail-sync'
import type { MailSyncService } from '../../../service/domain/mail/mail-sync'
import { mockUser, sessionOf, stubMailAccountService, stubMailSyncService } from './helpers'

const createApp = (overrides: Partial<MailSyncService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/mail/sync',
        createManageMailSyncRoute({
            getSession: sessionOf(mockUser),
            mailSyncService: stubMailSyncService(overrides),
            mailAccountService: stubMailAccountService(),
        }),
    )
    return app
}

describe('GET /manage/mail/sync', () => {
    test('accountId 쿼리가 있으면 상태를 조회한다', async () => {
        const getSyncStatus = mock(() => Promise.resolve({ status: 'running' }))
        const res = await createApp({ getSyncStatus: getSyncStatus as never }).request('/manage/mail/sync?accountId=3')
        expect(res.status).toBe(200)
        expect(getSyncStatus).toHaveBeenCalledWith(3, 'u1')
        expect(await res.text()).toContain('running')
    })
})

describe('POST /manage/mail/sync', () => {
    test('syncAccount를 호출한다', async () => {
        const syncAccount = mock(() => Promise.resolve({ added: 1, updated: 0, deleted: 0 }))
        const res = await createApp({ syncAccount: syncAccount as never }).request('/manage/mail/sync', {
            method: 'POST',
            body: new URLSearchParams({ accountId: '3' }),
        })
        expect(res.status).toBe(303)
        expect(syncAccount).toHaveBeenCalledWith(3, 'u1', undefined)
    })

    test('historical은 syncHistorical을 호출한다', async () => {
        const syncHistorical = mock(() => Promise.resolve({ added: 0, updated: 0, deleted: 0, durationMs: 1 }))
        const res = await createApp({ syncHistorical: syncHistorical as never }).request('/manage/mail/sync/historical', {
            method: 'POST',
            body: new URLSearchParams({ accountId: '3', batchSize: '50' }),
        })
        expect(res.status).toBe(303)
        expect(syncHistorical).toHaveBeenCalledTimes(1)
        const [accountId, userId, options] = syncHistorical.mock.calls[0] as unknown as [number, string, { batchSize?: number }]
        expect(accountId).toBe(3)
        expect(userId).toBe('u1')
        expect(options.batchSize).toBe(50)
    })
})
