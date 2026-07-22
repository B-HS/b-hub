import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMetricsHeartbeatRoute } from '../../../route/metrics/heartbeat'
import { errorHandler } from '../../../middleware/error-handler'

const createApp = (cronSecret: string) => {
    const checkHeartbeats = mock(() => Promise.resolve({ down: ['dev-1'], recovered: [] }))
    const app = new Hono()
    app.use('*', errorHandler())
    app.route('/metrics', createMetricsHeartbeatRoute({ metricsLogService: { checkHeartbeats } as never, cronSecret }))
    return { app, checkHeartbeats }
}

describe('metrics heartbeat-check', () => {
    test('인증 없이 호출하면 401이다', async () => {
        const { app, checkHeartbeats } = createApp('secret')
        const res = await app.request('/metrics/heartbeat-check', { method: 'POST' })
        expect(res.status).toBe(401)
        expect(checkHeartbeats).not.toHaveBeenCalled()
    })

    test('x-cron-secret 헤더로 통과하고 감지 결과를 반환한다', async () => {
        const { app } = createApp('secret')
        const res = await app.request('/metrics/heartbeat-check', { method: 'POST', headers: { 'x-cron-secret': 'secret' } })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.down).toEqual(['dev-1'])
    })

    test('Authorization Bearer와 GET도 지원한다', async () => {
        const { app } = createApp('secret')
        const res = await app.request('/metrics/heartbeat-check', { headers: { Authorization: 'Bearer secret' } })
        expect(res.status).toBe(200)
    })

    test('cronSecret이 빈 문자열이면 항상 401이다', async () => {
        const { app } = createApp('')
        const res = await app.request('/metrics/heartbeat-check', { method: 'POST', headers: { 'x-cron-secret': '' } })
        expect(res.status).toBe(401)
    })
})
