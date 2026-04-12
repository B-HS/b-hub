import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import type { UploadEventConsumer } from '../../service/shared/upload-event-consumer'

type DriveEventsRouteDeps = {
    uploadEventConsumer: UploadEventConsumer
    uploadServerSecret: string
}

export const createDriveEventsRoute = (deps: DriveEventsRouteDeps) => {
    const route = new Hono()

    route.post(
        '/consume',
        withErrorHandling(async (c) => {
            const authHeader = c.req.header('Authorization')
            const cronSecret = c.req.header('x-cron-secret')
            const secret = authHeader?.replace('Bearer ', '') ?? cronSecret

            if (!secret || secret !== deps.uploadServerSecret) {
                throw createAppError('UNAUTHORIZED')
            }

            const processed = await deps.uploadEventConsumer.consume(100)
            return c.json(successResponse({ processed }))
        }),
    )

    return route
}
