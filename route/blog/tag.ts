import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { tagCreateSchema } from '../../dto/blog/tag'

type Tag = {
    tagId: number
    tag: string
}

type TagRouteDeps = {
    db: {
        getTagList: () => Promise<Tag[]>
        createTag: (tag: string) => Promise<Tag>
    }
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createTagRoute = (deps: TagRouteDeps) => {
    const route = new Hono()

    const requireAdmin = async (c: { req: { raw: { headers: Headers } } }) => {
        const session = await deps.getSession(c)
        if (!session) throw createAppError('UNAUTHORIZED')
        if (session.user.role !== 'admin') throw createAppError('FORBIDDEN')
        return session
    }

    route.get(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '태그 목록 조회',
            responses: { 200: { description: '태그 목록' } },
        }),
        withErrorHandling(async (c) => {
            const tags = await deps.db.getTagList()
            return c.json(successResponse({ tags }))
        }),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Blog'],
            summary: '태그 생성',
            responses: {
                200: { description: '생성된 태그' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', tagCreateSchema),
        withErrorHandling(async (c) => {
            await requireAdmin(c)
            const input = c.req.valid('json' as never) as z.infer<typeof tagCreateSchema>
            const result = await deps.db.createTag(input.tag)
            return c.json(successResponse(result))
        }),
    )

    return route
}
