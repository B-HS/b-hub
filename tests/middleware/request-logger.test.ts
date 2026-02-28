import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { requestLogger } from '../../middleware/request-logger'

const createMockDb = () => {
    const insertValues = mock(() => ({ catch: mock(() => {}) }))
    return {
        insert: mock(() => ({ values: insertValues })),
        _insertValues: insertValues,
    }
}

const createApp = (db = createMockDb()) => {
    const app = new Hono()
    app.use('*', requestLogger({ db: db as never }))
    app.get('/test', (c) => c.json({ ok: true }))
    app.get('/error', (c) => {
        c.set('errorCode', 'TEST_ERROR')
        return c.json({ error: true }, 500)
    })
    return { app, db }
}

describe('requestLogger middleware', () => {
    test('요청 후 db.insert를 호출한다', async () => {
        const { app, db } = createApp()
        await app.request('/test')
        expect(db.insert).toHaveBeenCalled()
    })

    test('로깅 실패해도 응답을 차단하지 않는다', async () => {
        const db = createMockDb()
        db._insertValues.mockImplementation(() => ({
            catch: (fn: (e: Error) => void) => fn(new Error('DB error')),
        }))
        const { app } = createApp(db)
        const res = await app.request('/test')
        expect(res.status).toBe(200)
    })
})
