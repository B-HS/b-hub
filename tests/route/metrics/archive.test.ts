import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMetricsArchiveRoute } from '../../../route/metrics/archive'
import { errorHandler } from '../../../middleware/error-handler'

const createApp = (cronSecret: string) => {
    const archiveOldLogs = mock(() =>
        Promise.resolve({
            cutoff: '2026-07-15T00:00:00.000Z',
            archived: [{ day: '2026-07-10', count: 2, deleted: 2 }],
            totalArchived: 2,
            totalDeleted: 2,
        }),
    )
    const app = new Hono()
    app.use('*', errorHandler())
    app.route('/metrics', createMetricsArchiveRoute({ metricsLogService: { archiveOldLogs } as never, cronSecret }))
    return { app, archiveOldLogs }
}

describe('metrics archive', () => {
    test('인증 없이 호출하면 401이다', async () => {
        const { app, archiveOldLogs } = createApp('secret')
        const res = await app.request('/metrics/archive', { method: 'POST' })
        expect(res.status).toBe(401)
        expect(archiveOldLogs).not.toHaveBeenCalled()
    })

    test('x-cron-secret 으로 통과하고 아카이브 결과를 반환한다', async () => {
        const { app } = createApp('secret')
        const res = await app.request('/metrics/archive', { method: 'POST', headers: { 'x-cron-secret': 'secret' } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.totalArchived).toBe(2)
        expect(body.data.archived[0].day).toBe('2026-07-10')
    })

    test('Bearer와 GET도 지원한다', async () => {
        const { app } = createApp('secret')
        const res = await app.request('/metrics/archive', { headers: { Authorization: 'Bearer secret' } })
        expect(res.status).toBe(200)
    })

    test('cronSecret이 빈 문자열이면 항상 401이다', async () => {
        const { app } = createApp('')
        const res = await app.request('/metrics/archive', { method: 'POST', headers: { 'x-cron-secret': '' } })
        expect(res.status).toBe(401)
    })
})
