import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { ERROR_MESSAGE } from '../../lib/error-message'

describe('withErrorHandling', () => {
    test('정상 응답을 그대로 통과시킨다', async () => {
        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async (c) => c.json({ ok: true })),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({ ok: true })
    })

    test('AppError를 JSON 에러 응답으로 변환한다', async () => {
        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async () => {
                throw createAppError('NOT_FOUND')
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error.code).toBe('NOT_FOUND')
    })

    test('AppError 의 사유를 errorDetail 컨텍스트 변수로 남겨 로그 캡처가 읽게 한다', async () => {
        const app = new Hono()
        let captured: unknown = null
        app.use('*', async (c, next) => {
            await next()
            captured = c.get('errorDetail' as never)
        })
        app.get(
            '/test',
            withErrorHandling(async () => {
                throw createAppError('WEATHER_KMA_API_ERROR', { detail: 'HTTP 403' })
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(502)
        expect(captured).toBe(`${ERROR_MESSAGE.WEATHER_KMA_API_ERROR} (HTTP 403)`)
    })

    test('AppError의 details를 포함한다', async () => {
        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async () => {
                throw createAppError('VALIDATION_ERROR', { field: 'email' })
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error.details).toEqual({ field: 'email' })
    })

    test('알 수 없는 에러는 500으로 처리한다', async () => {
        const app = new Hono()
        app.get(
            '/test',
            withErrorHandling(async () => {
                throw new Error('unexpected')
            }),
        )

        const res = await app.request('/test')
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })
})
