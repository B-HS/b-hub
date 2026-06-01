import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAdmin, withAuth } from '../../lib/with-auth'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { deviceKeyCreateSchema, deviceKeyResponseSchema } from '../../dto/logs/device-key'
import type { DeviceKeyService } from '../../service/domain/logs/device-key'
import type { AuthContext } from '../../lib/hono-types'

type DeviceKeyRouteDeps = {
    deviceKeyService: DeviceKeyService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createDeviceKeyRoute = (deps: DeviceKeyRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/',
        describeRoute({
            tags: ['Logs'],
            summary: '디바이스 키 목록 조회 (Admin)',
            responses: {
                200: {
                    description: '키 목록',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(deviceKeyResponseSchema) })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const keys = await deps.deviceKeyService.listAll()
                const data = keys.map((k) => ({
                    id: k.id,
                    deviceId: k.deviceId,
                    label: k.label,
                    dailyLimit: k.dailyLimit,
                    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                    revokedAt: k.revokedAt?.toISOString() ?? null,
                    createdAt: k.createdAt.toISOString(),
                }))
                return c.json(successResponse(data))
            }),
        ),
    )

    route.post(
        '/',
        describeRoute({
            tags: ['Logs'],
            summary: '디바이스 키 발급 (Admin, 1회만 표시)',
            responses: {
                200: {
                    description: '발급된 키',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.object({ key: z.string() }) })) } },
                },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('json', deviceKeyCreateSchema),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const body = c.req.valid('json' as never) as z.infer<typeof deviceKeyCreateSchema>
                const key = await deps.deviceKeyService.create(body.deviceId, body.label)
                return c.json(successResponse({ key }))
            }),
        ),
    )

    route.delete(
        '/:id',
        describeRoute({
            tags: ['Logs'],
            summary: '디바이스 키 폐기 (Admin)',
            responses: {
                200: { description: '폐기 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'VALIDATION_ERROR']),
            },
        }),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const id = parseInt(c.req.param('id'), 10)
                if (isNaN(id)) throw createAppError('VALIDATION_ERROR')
                await deps.deviceKeyService.revoke(id)
                return c.json(successResponse({ revoked: true }))
            }),
        ),
    )

    return route
}
