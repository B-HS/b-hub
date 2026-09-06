import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { verifyCronAuth } from '../../lib/cron-auth'
import { successResponse } from '../../lib/api-response'
import type { StorageLifecycleService } from '../../service/shared/storage-lifecycle'

type DriveLifecycleRouteDeps = {
    storageLifecycleService: StorageLifecycleService
    uploadServerSecret: string
}

const CRON_METHODS = ['GET', 'POST']

export const createDriveLifecycleRoute = (deps: DriveLifecycleRouteDeps) => {
    const route = new Hono()

    route.on(
        CRON_METHODS,
        '/evict-r2',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const evicted = await deps.storageLifecycleService.evictR2Stale()
            return c.json(successResponse({ evicted }))
        }),
    )

    route.on(
        CRON_METHODS,
        '/evict-local',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const evicted = await deps.storageLifecycleService.evictLocalFifo()
            return c.json(successResponse({ evicted }))
        }),
    )

    route.on(
        CRON_METHODS,
        '/auto-promote',
        withErrorHandling(async (c) => {
            verifyCronAuth(c, deps.uploadServerSecret)
            const promoted = await deps.storageLifecycleService.autoPromote()
            return c.json(successResponse({ promoted }))
        }),
    )

    return route
}
