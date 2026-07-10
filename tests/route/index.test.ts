import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createRouter } from '../../route/index'
import { resetEnvCache } from '../../lib/env'
import { errorHandler } from '../../middleware/error-handler'

const MOCK_CURRENT_PATH = '/api/weather/mock/current?nx=60&ny=127'

const buildApiApp = () => {
    const app = new Hono()
    app.use('*', errorHandler())
    const { api } = createRouter({})
    app.route('/api', api)
    return app
}

describe('createRouter weather mock 마운트 게이트', () => {
    test('production 이 아닌 환경에서는 mock 라우트를 마운트한다 (키 없으면 401)', async () => {
        resetEnvCache()
        const res = await buildApiApp().request(MOCK_CURRENT_PATH)
        expect(res.status).toBe(401)
    })
})
