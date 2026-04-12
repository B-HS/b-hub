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
    getGdriveAccessToken: () => Promise<string | null>
    gdriveRootFolderId: string
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

    route.post(
        '/assets/prepare',
        describeRoute({
            tags: ['Drive'],
            summary: '업로드 사전 등록 (메타데이터만 저장, preparing 상태)',
            responses: {
                200: { description: 'assetId, s3Key, uploadToken 반환' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_QUOTA_EXCEEDED', 'DRIVE_INVALID_MIME_TYPE']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const body = await c.req.json()
            console.log(`[prepare] userId=${session.user.id} sizeBytes=${body.sizeBytes}`)
            const result = await deps.driveAssetService.prepare(session.user.id, {
                originalName: body.originalName,
                mimeType: body.mimeType,
                sizeBytes: Number(body.sizeBytes),
                folderId: body.folderId ?? null,
                fileHash: body.fileHash ?? '',
            })
            return c.json(successResponse(result))
        }),
    )

    route.post(
        '/assets/:assetId/complete',
        describeRoute({
            tags: ['Drive'],
            summary: '업로드 완료 콜백 (Lightsail → hyun-hub)',
            responses: {
                200: { description: '업로드 완료 상태' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_UPLOAD_EVENT_FAILED']),
            },
        }),
        withErrorHandling(async (c) => {
            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const body = await c.req.json()

            const result = await deps.driveAssetService.complete(assetId, body.uploadToken, {
                fileHash: body.fileHash ?? '',
                storageTiers: body.storageTiers ?? '',
                gdriveFileId: body.gdriveFileId ?? null,
                localPath: body.localPath ?? null,
                thumbnailBase64: body.thumbnailBase64 ?? null,
            })
            return c.json(successResponse(result))
        }),
    )

    route.post(
        '/assets/:assetId/gdrive-token',
        describeRoute({
            tags: ['Drive'],
            summary: 'Google Drive access token 발급 (upload-server 전용)',
            responses: {
                200: { description: 'access token + root folder ID' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND']),
            },
        }),
        withErrorHandling(async (c) => {
            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const body = await c.req.json()

            const asset = await deps.driveAssetService.getAssetForTokenExchange(assetId, body.uploadToken)
            if (!asset) throw createAppError('UNAUTHORIZED')

            const accessToken = await deps.getGdriveAccessToken()
            if (!accessToken) throw createAppError('DRIVE_L3_UPLOAD_FAILED')

            return c.json(successResponse({ accessToken, rootFolderId: deps.gdriveRootFolderId }))
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
        '/assets/:assetId/download',
        describeRoute({
            tags: ['Drive'],
            summary: '파일 스트림 다운로드 (L2/L3 cascade)',
            responses: {
                200: { description: '파일 스트림' },
                ...errorResponses(['UNAUTHORIZED', 'DRIVE_ASSET_NOT_FOUND', 'DRIVE_ALL_TIERS_FAILED']),
            },
        }),
        withErrorHandling(async (c) => {
            const session = await deps.getSession(c)
            if (!session) throw createAppError('UNAUTHORIZED')

            const { assetId } = driveAssetParamSchema.parse(c.req.param())
            const { stream, mimeType, originalName, sizeBytes } = await deps.driveAssetService.download(assetId, session.user.id)

            return new Response(stream, {
                headers: {
                    'Content-Type': mimeType,
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(originalName)}"`,
                    'Content-Length': String(sizeBytes),
                },
            })
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
