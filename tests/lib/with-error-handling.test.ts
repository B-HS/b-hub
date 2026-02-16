import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'

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
