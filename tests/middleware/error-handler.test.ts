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
    test('AppError 의 사유를 errorDetail 컨텍스트 변수로 남긴다', async () => {
        const app = new Hono()
        let captured: unknown = null
        app.use('*', async (c, next) => {
            await next()
            captured = c.get('errorDetail' as never)
        })
        app.use('*', errorHandler())
        app.get('/test', async () => {
            throw createAppError('MAIL_PROVIDER_ERROR', { message: 'Failed query: insert' })
        })

        const res = await app.request('/test')
        expect(res.status).toBe(502)
        expect(captured).toBe('메일 서버 연결에 실패했습니다 (Failed query: insert)')
    })

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

    test('AppError에 details가 있으면 응답에 포함한다', async () => {
        const app = createApp(() => {
            throw createAppError('VALIDATION_ERROR', { field: 'email' })
        })
        const res = await app.request('/test')
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(body.error.details).toEqual({ field: 'email' })
    })

    test('문자열 에러를 500으로 처리한다', async () => {
        const app = createApp((() => {
            throw 'string error'
        }) as () => never)
        const res = await app.request('/test')
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })

    test('null 에러를 500으로 처리한다', async () => {
        const app = createApp((() => {
            throw null
        }) as () => never)
        const res = await app.request('/test')
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })
})
