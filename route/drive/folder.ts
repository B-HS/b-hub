import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { driveFolderCreateSchema, driveFolderUpdateSchema, driveFolderListQuerySchema, driveFolderParamSchema } from '../../dto/drive/folder'
import type { DriveFolderService } from '../../service/domain/drive/drive-folder'

type DriveFolderRouteDeps = {
    driveFolderService: DriveFolderService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createDriveFolderRoute = (deps: DriveFolderRouteDeps) => {
    const route = new Hono()

    route.post(
        '/',
        describeRoute({
            tags: ['Drive'],
            summary: '폴더 생성',
            responses: {
                201: { description: '생성된 폴더 정보' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_FOLDER_NOT_FOUND', 'DRIVE_FOLDER_NAME_DUPLICATE']),
            },
        }),
        validator('json', driveFolderCreateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const data = c.req.valid('json' as never) as z.infer<typeof driveFolderCreateSchema>
            const result = await deps.driveFolderService.create(session.user.id, data)
            return c.json(successResponse(result), 201)
        }),
    )

    route.get(
        '/',
        describeRoute({
            tags: ['Drive'],
            summary: '폴더 목록 조회',
            responses: {
                200: { description: '폴더 목록' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        validator('query', driveFolderListQuerySchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { parentId } = c.req.valid('query' as never) as z.infer<typeof driveFolderListQuerySchema>
            const folders = await deps.driveFolderService.list(session.user.id, parentId)
            return c.json(successResponse(folders))
        }),
    )

    route.get(
        '/:folderId',
        describeRoute({
            tags: ['Drive'],
            summary: '폴더 상세 조회',
            responses: {
                200: { description: '폴더 상세 + breadcrumb' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_FOLDER_NOT_FOUND', 'DRIVE_FOLDER_NOT_FOUND']),
            },
        }),
        validator('param', driveFolderParamSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { folderId } = c.req.valid('param' as never) as z.infer<typeof driveFolderParamSchema>
            const result = await deps.driveFolderService.getDetail(folderId, session.user.id)
            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/:folderId',
        describeRoute({
            tags: ['Drive'],
            summary: '폴더 수정 (이름 변경, 이동)',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses([
                    'UNAUTHORIZED',
                    'DRIVE_FOLDER_NOT_FOUND',
                    'DRIVE_FOLDER_NOT_FOUND',
                    'DRIVE_FOLDER_CIRCULAR_REF',
                    'DRIVE_FOLDER_NAME_DUPLICATE',
                ]),
            },
        }),
        validator('param', driveFolderParamSchema),
        validator('json', driveFolderUpdateSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { folderId } = c.req.valid('param' as never) as z.infer<typeof driveFolderParamSchema>
            const data = c.req.valid('json' as never) as z.infer<typeof driveFolderUpdateSchema>
            const result = await deps.driveFolderService.update(folderId, session.user.id, data)
            return c.json(successResponse(result))
        }),
    )

    route.delete(
        '/:folderId',
        describeRoute({
            tags: ['Drive'],
            summary: '폴더 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_FOLDER_NOT_FOUND', 'DRIVE_FOLDER_NOT_FOUND']),
            },
        }),
        validator('param', driveFolderParamSchema),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { folderId } = c.req.valid('param' as never) as z.infer<typeof driveFolderParamSchema>
            const result = await deps.driveFolderService.remove(folderId, session.user.id)
            return c.json(successResponse(result))
        }),
    )

    return route
}
