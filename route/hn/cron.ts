import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import type { HnFetcherService } from '../../service/domain/hn/hn-fetcher'
import type { HnDigestService } from '../../service/domain/hn/hn-digest'

type CronRouteDeps = {
    cronSecret: string
    hnFetcher: HnFetcherService
    hnDigest: HnDigestService
}

export const createCronRoute = (deps: CronRouteDeps) => {
    const route = new Hono()

    const verifyCronSecret = (c: { req: { header: (name: string) => string | undefined } }) => {
        if (!deps.cronSecret) return false
        const authHeader = c.req.header('Authorization') ?? ''
        const expected = `Bearer ${deps.cronSecret}`
        if (authHeader.length !== expected.length) return false
        const encoder = new TextEncoder()
        const a = encoder.encode(authHeader)
        const b = encoder.encode(expected)
        if (a.byteLength !== b.byteLength) return false
        return timingSafeEqual(a, b)
    }

    route.get(
        '/sync',
        describeRoute({
            tags: ['HN Cron'],
            summary: '스토리 동기화',
            responses: {
                200: { description: '동기화 결과' },
                ...errorResponses(['HN_CRON_SECRET_INVALID']),
            },
        }),
        withErrorHandling(async (c) => {
            if (!verifyCronSecret(c)) throw createAppError('HN_CRON_SECRET_INVALID')

            const result = await deps.hnFetcher.syncAllTypes()
            return c.json(successResponse({ synced: result }))
        }),
    )

    route.get(
        '/daily',
        describeRoute({
            tags: ['HN Cron'],
            summary: '일간 다이제스트 생성',
            responses: {
                200: { description: '다이제스트 결과' },
                ...errorResponses(['HN_CRON_SECRET_INVALID']),
            },
        }),
        withErrorHandling(async (c) => {
            if (!verifyCronSecret(c)) throw createAppError('HN_CRON_SECRET_INVALID')

            const result = await deps.hnDigest.runDaily()
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/weekly',
        describeRoute({
            tags: ['HN Cron'],
            summary: '주간 다이제스트 생성',
            responses: {
                200: { description: '다이제스트 결과' },
                ...errorResponses(['HN_CRON_SECRET_INVALID']),
            },
        }),
        withErrorHandling(async (c) => {
            if (!verifyCronSecret(c)) throw createAppError('HN_CRON_SECRET_INVALID')

            const result = await deps.hnDigest.runWeekly()
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/monthly',
        describeRoute({
            tags: ['HN Cron'],
            summary: '월간 다이제스트 생성',
            responses: {
                200: { description: '다이제스트 결과' },
                ...errorResponses(['HN_CRON_SECRET_INVALID']),
            },
        }),
        withErrorHandling(async (c) => {
            if (!verifyCronSecret(c)) throw createAppError('HN_CRON_SECRET_INVALID')

            const result = await deps.hnDigest.runMonthly()
            return c.json(successResponse(result))
        }),
    )

    return route
}
