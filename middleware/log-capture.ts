import type { Context, Next } from 'hono'
import { captureException } from '../lib/sentry'
import { ERROR_MESSAGE } from '../lib/error-message'
import { serviceNameFromPath, severityFromStatus, errorCodeFromStatus } from '../lib/log-service-name'
import { maskSensitivePath } from '../lib/mask-sensitive-path'
import type { ErrorCode } from '../lib/error-code'
import type { LogEventService } from '../service/domain/logs/log-event'

type LogCaptureDeps = {
    logEventService: LogEventService
}

const readVar = (c: Context, key: string) => {
    try {
        return c.get(key) ?? null
    } catch {
        return null
    }
}

export const logCapture = (deps: LogCaptureDeps) => async (c: Context, next: Next) => {
    const start = Date.now()
    await next()

    try {
        const status = c.res.status
        if (status < 400) return
        if (c.req.path.startsWith('/api/logs')) return

        const errorCode = (readVar(c, 'errorCode') as string | null) ?? errorCodeFromStatus(status)
        const errorDetail = readVar(c, 'errorDetail') as string | null
        const description = errorDetail ?? ERROR_MESSAGE[errorCode as ErrorCode] ?? errorCode

        await deps.logEventService.captureServerError({
            service: serviceNameFromPath(c.req.path),
            errorCode,
            severity: severityFromStatus(status),
            errorDescription: String(description).slice(0, 2000),
            correlationId: c.req.header('x-correlation-id') ?? undefined,
            ingestIp: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined,
            source: 'server',
            details: { path: maskSensitivePath(c.req.path), method: c.req.method, status, durationMs: Date.now() - start },
        })
    } catch (e) {
        captureException(e)
    }
}
