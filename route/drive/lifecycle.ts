import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import type { StorageLifecycleService } from '../../service/shared/storage-lifecycle'

type DriveLifecycleRouteDeps = {
    storageLifecycleService: StorageLifecycleService
    uploadServerSecret: string
}

const verifyCronAuth = (c: { req: { header: (name: string) => string | undefined } }, secret: string) => {
    const authHeader = c.req.header('Authorization')
    const cronSecret = c.req.header('x-cron-secret')
    const provided = authHeader?.replace('Bearer ', '') ?? cronSecret

    if (!provided || provided !== secret) {
        throw createAppError('UNAUTHORIZED')
    }
}

export const createDriveLifecycleRoute = (deps: DriveLifecycleRouteDeps) => {
    const route = new Hono()

    route.post(
        '/evict-r2',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const evicted = await deps.storageLifecycleService.evictR2Stale()
            return c.json(successResponse({ evicted }))
        }),
    )

    route.post(
        '/evict-local',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const evicted = await deps.storageLifecycleService.evictLocalFifo()
            return c.json(successResponse({ evicted }))
        }),
    )

    route.post(
        '/auto-promote',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const promoted = await deps.storageLifecycleService.autoPromote()
            return c.json(successResponse({ promoted }))
        }),
    )

    return route
}
