import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { successResponse, paginatedResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { createAppError } from '../../lib/error'
import { requireMetricsToken } from '../../middleware/require-metrics-token'
import { METRICS_TOKEN_SCOPE } from '../../dto/metrics/token'
import { metricsDeviceResponseSchema, metricsLogListQuerySchema, metricsLogResponseSchema, metricsSeriesQuerySchema } from '../../dto/metrics/query'
import type { MetricsLogService } from '../../service/domain/metrics/log'
import type { MetricsTokenService } from '../../service/domain/metrics/token'
import type { AuthContext } from '../../lib/hono-types'

type MetricsQueryRouteDeps = {
    metricsLogService: MetricsLogService
    metricsTokenService: MetricsTokenService
}

export const createMetricsQueryRoute = (deps: MetricsQueryRouteDeps) => {
    const route = new Hono<AuthContext>()

    route.get(
        '/devices',
        describeRoute({
            tags: ['Metrics'],
            summary: '디바이스 목록 조회 (Admin Token)',
            responses: {
                200: {
                    description: '디바이스 목록',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(metricsDeviceResponseSchema) })) },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        withErrorHandling(async (c) => {
            const devices = await deps.metricsLogService.listDevices()
            const data = devices.map((d) => ({
                deviceId: d.deviceId,
                tokenId: d.tokenId,
                tokenAlias: d.tokenAlias,
                hostname: d.hostname,
                os: d.os,
                arch: d.arch,
                agentVersion: d.agentVersion,
                intervalSec: d.intervalSec,
                firstSeenAt: d.firstSeenAt.toISOString(),
                lastSeenAt: d.lastSeenAt.toISOString(),
                online: d.online,
            }))
            return c.json(successResponse(data))
        }),
    )

    route.get(
        '/logs',
        describeRoute({
            tags: ['Metrics'],
            summary: '수집 데이터 목록 조회 (Admin Token)',
            responses: {
                200: {
                    description: '수집 데이터 목록',
                    content: {
                        'application/json': { schema: resolver(z.object({ success: z.literal(true), data: z.array(metricsLogResponseSchema) })) },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN', 'VALIDATION_ERROR']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        validator('query', metricsLogListQuerySchema),
        withErrorHandling(async (c) => {
            const q = c.req.valid('query' as never) as z.infer<typeof metricsLogListQuerySchema>
            const { rows, total } = await deps.metricsLogService.list(q)
            const data = rows.map((r) => ({
                tokenId: r.tokenId,
                tokenAlias: r.tokenAlias,
                deviceId: r.deviceId,
                hostname: r.hostname,
                os: r.os,
                arch: r.arch,
                agentVersion: r.agentVersion,
                payload: r.payload,
                receivedAt: r.receivedAt.toISOString(),
            }))
            return c.json(paginatedResponse(data, { page: Math.floor(q.offset / q.limit) + 1, limit: q.limit, total }))
        }),
    )

    route.get(
        '/series',
        describeRoute({
            tags: ['Metrics'],
            summary: 'payload 수치 필드 시계열 조회 (Admin Token)',
            responses: {
                200: {
                    description: '시계열 포인트',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: z.object({ points: z.array(z.object({ t: z.string(), v: z.number() })) }),
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['METRICS_TOKEN_INVALID', 'METRICS_TOKEN_FORBIDDEN', 'METRICS_DEVICE_NOT_FOUND', 'VALIDATION_ERROR']),
            },
        }),
        requireMetricsToken({ metricsTokenService: deps.metricsTokenService, scope: METRICS_TOKEN_SCOPE.ADMIN }),
        validator('query', metricsSeriesQuerySchema),
        withErrorHandling(async (c) => {
            const q = c.req.valid('query' as never) as z.infer<typeof metricsSeriesQuerySchema>
            const device = await deps.metricsLogService.getDevice(q.deviceId)
            if (!device) throw createAppError('METRICS_DEVICE_NOT_FOUND')
            const points = await deps.metricsLogService.series(q)
            return c.json(successResponse({ points: points.map((p) => ({ t: p.t.toISOString(), v: p.v })) }))
        }),
    )

    return route
}
