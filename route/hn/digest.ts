import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { digestListQuerySchema, digestDetailParamSchema } from '../../dto/hn/digest'

type DigestRouteDb = {
    getDigestsByType: (type: string, limit: number) => Promise<Record<string, unknown>[]>
    getDigestByTypeAndKey: (type: string, key: string) => Promise<Record<string, unknown> | null>
    getStoriesByIds: (ids: number[]) => Promise<Record<string, unknown>[]>
    getSummariesByStoryIds: (ids: number[]) => Promise<Record<string, unknown>[]>
}

type DigestRouteDeps = {
    db: DigestRouteDb
}

export const createDigestRoute = (deps: DigestRouteDeps) => {
    const route = new Hono()

    route.get(
        '/',
        describeRoute({
            tags: ['HN Digest'],
            summary: '다이제스트 목록 조회',
            responses: { 200: { description: '다이제스트 목록' } },
        }),
        validator('query', digestListQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof digestListQuerySchema>
            const digestList = await deps.db.getDigestsByType(query.type, query.limit)
            return c.json(successResponse({ digests: digestList, type: query.type, limit: query.limit }))
        }),
    )

    route.get(
        '/:type/:key',
        describeRoute({
            tags: ['HN Digest'],
            summary: '다이제스트 상세 조회',
            responses: {
                200: { description: '다이제스트 상세' },
                ...errorResponses(['NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const type = c.req.param('type')
            const key = c.req.param('key')

            if (!['daily', 'weekly', 'monthly'].includes(type)) {
                throw createAppError('VALIDATION_ERROR')
            }

            const digest = await deps.db.getDigestByTypeAndKey(type, key)
            if (!digest) throw createAppError('NOT_FOUND')

            const storyIds = (digest.storyIds ?? []) as number[]
            const storyList = storyIds.length > 0 ? await deps.db.getStoriesByIds(storyIds) : []
            const summaryList = storyIds.length > 0 ? await deps.db.getSummariesByStoryIds(storyIds) : []

            const summaryMap = new Map(summaryList.map((s) => [s.storyId as number, s]))
            const storiesWithSummary = storyList.map((story) => ({
                ...story,
                summary: summaryMap.get(story.id as number) ?? null,
            }))

            return c.json(successResponse({ digest, stories: storiesWithSummary }))
        }),
    )

    return route
}
