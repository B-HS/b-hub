import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'
import { METRICS_TOKEN_SCOPE } from '../dto/metrics/token'
import type { MetricsTokenScope } from '../dto/metrics/token'
import type { MetricsTokenService } from '../service/domain/metrics/token'

type RequireMetricsTokenDeps = {
    metricsTokenService: MetricsTokenService
    scope: MetricsTokenScope
    checkRateLimit?: boolean
}

const BEARER_PREFIX = 'Bearer '

export const requireMetricsToken = (deps: RequireMetricsTokenDeps) => async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length) : c.req.header('X-Metrics-Token')
    if (!token) throw createAppError('METRICS_TOKEN_INVALID')

    const record = await deps.metricsTokenService.validate(token)
    if (!record) throw createAppError('METRICS_TOKEN_INVALID')
    if (deps.scope === METRICS_TOKEN_SCOPE.ADMIN && record.scope !== METRICS_TOKEN_SCOPE.ADMIN) {
        throw createAppError('METRICS_TOKEN_FORBIDDEN')
    }

    if (deps.checkRateLimit) {
        const allowed = await deps.metricsTokenService.checkRateLimit(record.id, record.dailyLimit)
        if (!allowed) throw createAppError('METRICS_TOKEN_RATE_LIMIT')
    }

    c.set('metricsTokenId' as never, record.id as never)
    c.set('metricsTokenAlias' as never, record.alias as never)

    await next()
}
