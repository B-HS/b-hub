import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { errorHandler } from '../../middleware/error-handler'
import { createAppError } from '../../lib/error'

const createApp = (throwFn: () => never) => {
    const app = new Hono()
    app.use('*', errorHandler())
    app.get('/test', async () => {
        throwFn()
    })
    return app
}

describe('errorHandler middleware', () => {
    test('AppError면 해당 statusCode와 코드를 반환한다', async () => {
        const app = createApp(() => {
            throw createAppError('NOT_FOUND')
        })
        const res = await app.request('/test')
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('NOT_FOUND')
    })

    test('UNAUTHORIZED AppError면 401을 반환한다', async () => {
        const app = createApp(() => {
            throw createAppError('UNAUTHORIZED')
        })
        const res = await app.request('/test')
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error.code).toBe('UNAUTHORIZED')
    })

    test('FORBIDDEN AppError면 403을 반환한다', async () => {
        const app = createApp(() => {
            throw createAppError('FORBIDDEN')
        })
        const res = await app.request('/test')
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error.code).toBe('FORBIDDEN')
    })

    test('알 수 없는 non-Error throw는 500을 반환한다', async () => {
        const app = createApp(() => {
            throw { unknown: true }
        })
        const res = await app.request('/test')
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })
})
