import { Hono } from 'hono'
import type { Context } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { withAdmin, withAuth } from '../../lib/with-auth'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { requireDeviceKey } from '../../middleware/require-device-key'
import {
    logEventIngestSchema,
    logEventBatchSchema,
    logEventResolveSchema,
    logEventListQuerySchema,
    logEventResponseSchema,
} from '../../dto/logs/log-event'
import type { LogEventService } from '../../service/domain/logs/log-event'
import type { DeviceKeyService } from '../../service/domain/logs/device-key'
import type { AuthContext } from '../../lib/hono-types'

const LOG_BATCH_MAX_EVENTS = 50

const readDeviceId = (c: Context) => c.get('deviceKeyDeviceId' as never) as string

type LogEventRouteDeps = {
    logEventService: LogEventService
    deviceKeyService: DeviceKeyService
    getSession: Parameters<typeof withAuth>[0]['getSession']
}

export const createLogEventRoute = (deps: LogEventRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.post(
        '/',
        describeRoute({
            tags: ['Logs'],
            summary: '로그 이벤트 수집 (Device)',
            responses: {
                200: {
                    description: '수집 완료',
                    content: { 'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.object({ id: z.number() }) })) } },
                },
                ...errorResponses(['LOG_DEVICE_KEY_INVALID', 'LOG_DEVICE_KEY_RATE_LIMIT', 'VALIDATION_ERROR']),
            },
        }),
        requireDeviceKey({ deviceKeyService: deps.deviceKeyService }),
        validator('json', logEventIngestSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof logEventIngestSchema>
            const deviceId = readDeviceId(c)
            const ingestIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined
            const { id } = await deps.logEventService.ingest({ ...body, deviceId }, { ingestIp, source: 'device' })
            return c.json(successResponse({ id }))
        }),
    )

    route.post(
        '/batch',
        describeRoute({
            tags: ['Logs'],
            summary: '로그 이벤트 배치 수집 (Device, 최대 50건)',
            responses: {
                200: {
                    description: '수집 완료',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.object({ count: z.number() }) })) },
                    },
                },
                ...errorResponses(['LOG_DEVICE_KEY_INVALID', 'LOG_DEVICE_KEY_RATE_LIMIT', 'LOG_BATCH_TOO_LARGE', 'VALIDATION_ERROR']),
            },
        }),
        requireDeviceKey({ deviceKeyService: deps.deviceKeyService }),
        validator('json', logEventBatchSchema),
        withErrorHandling(async (c) => {
            const body = c.req.valid('json' as never) as z.infer<typeof logEventBatchSchema>
            if (body.events.length > LOG_BATCH_MAX_EVENTS) throw createAppError('LOG_BATCH_TOO_LARGE')
            const deviceId = readDeviceId(c)
            const ingestIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined
            const events = body.events.map((event) => ({ ...event, deviceId }))
            const count = await deps.logEventService.ingestBatch(events, { ingestIp, source: 'device' })
            return c.json(successResponse({ count }))
        }),
    )

    route.get(
        '/',
        describeRoute({
            tags: ['Logs'],
            summary: '로그 이벤트 목록 조회 (Admin)',
            responses: {
                200: {
                    description: '목록',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(logEventResponseSchema) })) },
                    },
                },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        validator('query', logEventListQuerySchema),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const q = c.req.valid('query' as never) as z.infer<typeof logEventListQuerySchema>
                const { rows, total } = await deps.logEventService.list(q)
                const data = rows.map((r) => ({
                    id: r.id,
                    service: r.service,
                    errorCode: r.errorCode,
                    errorDescription: r.errorDescription,
                    severity: r.severity,
                    category: r.category,
                    deviceId: r.deviceId,
                    firmwareVersion: r.firmwareVersion,
                    source: r.source,
                    correlationId: r.correlationId,
                    sessionId: r.sessionId,
                    retryCount: r.retryCount,
                    occurredAt: r.occurredAt?.toISOString() ?? null,
                    resolvedAt: r.resolvedAt?.toISOString() ?? null,
                    details: r.details,
                    ingestIp: r.ingestIp,
                    createdAt: r.createdAt.toISOString(),
                }))
                return c.json(paginatedResponse(data, { page: Math.floor(q.offset / q.limit) + 1, limit: q.limit, total }))
            }),
        ),
    )

    route.post(
        '/purge',
        describeRoute({
            tags: ['Logs'],
            summary: '보관기간 경과 로그 정리 (Admin)',
            responses: {
                200: { description: '정리 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN']),
            },
        }),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const result = await deps.logEventService.purgeByPolicy()
                return c.json(successResponse(result))
            }),
        ),
    )

    route.patch(
        '/:id/resolve',
        describeRoute({
            tags: ['Logs'],
            summary: '로그 이벤트 해소 처리 (Admin)',
            responses: {
                200: { description: '해소 완료' },
                ...errorResponses(['UNAUTHORIZED', 'FORBIDDEN', 'LOG_EVENT_NOT_FOUND', 'VALIDATION_ERROR']),
            },
        }),
        validator('json', logEventResolveSchema),
        withErrorHandling(
            withAdmin({ getSession: deps.getSession })(async (c) => {
                const id = parseInt(c.req.param('id')!, 10)
                if (isNaN(id)) throw createAppError('VALIDATION_ERROR')
                const body = c.req.valid('json' as never) as z.infer<typeof logEventResolveSchema>
                const existing = await deps.logEventService.getById(id)
                if (!existing) throw createAppError('LOG_EVENT_NOT_FOUND')
                await deps.logEventService.resolve(id, body.resolvedAt)
                return c.json(successResponse({ resolved: true }))
            }),
        ),
    )

    return route
}
