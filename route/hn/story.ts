import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { storyListQuerySchema, storyIdParamSchema, searchQuerySchema, tagStoriesQuerySchema } from '../../dto/hn/story'

type StoryRouteDb = {
    getStoriesPaginated: (type: string | undefined, limit: number, offset: number) => Promise<Record<string, unknown>[]>
    getStoryById: (id: number) => Promise<Record<string, unknown> | null>
    getSummariesByStoryIds: (ids: number[]) => Promise<Record<string, unknown>[]>
    getSummaryByStoryId: (id: number) => Promise<Record<string, unknown> | null>
    getCommentsByStoryId: (id: number) => Promise<Record<string, unknown>[]>
    getAllTags: () => Promise<Record<string, unknown>[]>
    getStoriesByTagName: (
        name: string,
        limit: number,
        offset: number,
    ) => Promise<{
        stories: Record<string, unknown>[]
        summaries: Record<string, unknown>[]
    }>
    searchStories: (q: string, limit: number) => Promise<Record<string, unknown>[]>
}

type StoryRouteDeps = {
    db: StoryRouteDb
}

export const createStoryRoute = (deps: StoryRouteDeps) => {
    const route = new Hono()

    route.get(
        '/stories',
        describeRoute({
            tags: ['HN'],
            summary: '스토리 목록 조회',
            responses: {
                200: { description: '스토리 목록' },
            },
        }),
        validator('query', storyListQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof storyListQuerySchema>
            const offset = (query.page - 1) * query.limit

            const storyList = await deps.db.getStoriesPaginated(query.type, query.limit, offset)
            const storyIds = storyList.map((s) => s.id as number)

            const summaryList = storyIds.length > 0 ? await deps.db.getSummariesByStoryIds(storyIds) : []
            const summaryMap = new Map(summaryList.map((s) => [s.storyId as number, s]))

            const result = storyList.map((story) => ({
                ...story,
                summary: summaryMap.get(story.id as number) ?? null,
            }))

            return c.json(
                successResponse({
                    stories: result,
                    page: query.page,
                    limit: query.limit,
                }),
            )
        }),
    )

    route.get(
        '/stories/:id',
        describeRoute({
            tags: ['HN'],
            summary: '스토리 상세 조회',
            responses: {
                200: { description: '스토리 상세' },
                ...errorResponses(['HN_STORY_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('HN_STORY_NOT_FOUND')

            const story = await deps.db.getStoryById(id)
            if (!story) throw createAppError('HN_STORY_NOT_FOUND')

            const summary = await deps.db.getSummaryByStoryId(id)
            const commentList = await deps.db.getCommentsByStoryId(id)

            return c.json(successResponse({ story, summary, comments: commentList }))
        }),
    )

    route.get(
        '/tags',
        describeRoute({
            tags: ['HN'],
            summary: '태그 목록',
            responses: { 200: { description: '태그 목록' } },
        }),
        withErrorHandling(async (c) => {
            const tagList = await deps.db.getAllTags()
            return c.json(successResponse({ tags: tagList }))
        }),
    )

    route.get(
        '/tags/:name/stories',
        describeRoute({
            tags: ['HN'],
            summary: '태그별 스토리',
            responses: { 200: { description: '태그별 스토리' } },
        }),
        validator('query', tagStoriesQuerySchema),
        withErrorHandling(async (c) => {
            const name = c.req.param('name')
            const query = c.req.valid('query' as never) as z.infer<typeof tagStoriesQuerySchema>
            const offset = (query.page - 1) * query.limit

            const result = await deps.db.getStoriesByTagName(name, query.limit, offset)

            return c.json(
                successResponse({
                    stories: result.stories,
                    summaries: result.summaries,
                    tag: name,
                    page: query.page,
                    limit: query.limit,
                }),
            )
        }),
    )

    route.get(
        '/search',
        describeRoute({
            tags: ['HN'],
            summary: '스토리 검색',
            responses: { 200: { description: '검색 결과' } },
        }),
        validator('query', searchQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof searchQuerySchema>
            const storyList = await deps.db.searchStories(query.q, query.limit)
            return c.json(successResponse({ stories: storyList, query: query.q }))
        }),
    )

    return route
}
