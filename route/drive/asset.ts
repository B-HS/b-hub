import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { driveAssetListQuerySchema, driveAssetParamSchema, driveAssetUpdateSchema } from '../../dto/drive/asset'
import type { DriveAssetService } from '../../service/domain/drive/drive-asset'

type DriveAssetRouteDeps = {
    driveAssetService: DriveAssetService
    getSession: (c: { req: { raw: { headers: Headers } } }) => Promise<{ user: { id: string; role: string | null } } | null>
}

export const createDriveAssetRoute = (deps: DriveAssetRouteDeps) => {
    const route = new Hono()

    route.post(
        '/assets',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 업로드',
            responses: {
                200: { description: '업로드된 파일 정보' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_FILE_TOO_LARGE', 'DRIVE_DUPLICATE_FILE', 'DRIVE_QUOTA_EXCEEDED']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const formData = await c.req.formData()
            const file = formData.get('file') as File | null
            if (!file) throw createAppError('VALIDATION_ERROR')

            const folderId = formData.get('folderId') as string | null
            const result = await deps.driveAssetService.upload(file, session.user.id, folderId ?? undefined)
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/assets',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 목록 조회',
            responses: {
                200: { description: '파일 목록' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const query = driveAssetListQuerySchema.parse(c.req.query())
            const result = await deps.driveAssetService.list(session.user.id, query)
            return c.json(paginatedResponse(result.data, { page: result.page, limit: result.limit, total: result.total }))
        }),
    )

    route.get(
        '/assets/:assetId',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 상세 조회',
            responses: {
                200: { description: '파일 상세 정보 및 다운로드 URL' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_ASSET_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const result = await deps.driveAssetService.getDetail(assetId, session.user.id)
            return c.json(successResponse(result))
        }),
    )

    route.patch(
        '/assets/:assetId',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 수정 (공개 설정, 폴더 이동)',
            responses: {
                200: { description: '수정 결과' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_FOLDER_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const data = driveAssetUpdateSchema.parse(await c.req.json())
            const result = await deps.driveAssetService.update(assetId, session.user.id, data)
            return c.json(successResponse(result))
        }),
    )

    route.delete(
        '/assets/:assetId',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 삭제',
            responses: {
                200: { description: '삭제 결과' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_ASSET_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const result = await deps.driveAssetService.remove(assetId, session.user.id)
            return c.json(successResponse(result))
        }),
    )

    route.get(
        '/quota',
        describeRoute({
            tags: ['Drive'],
            summary: '저장 공간 사용량 조회',
            responses: {
                200: { description: '사용량 정보' },
                ...errorResponses(['UNAUTHORIZED']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const result = await deps.driveAssetService.getQuota(session.user.id)
            return c.json(successResponse(result))
        }),
    )

    return route
}
