import { Hono } from 'hono'
import { withErrorHandling } from '../../lib/with-error-handling'
import { verifyCronAuth } from '../../lib/cron-auth'
import { successResponse } from '../../lib/api-response'
import type { StorageLifecycleService } from '../../service/shared/storage-lifecycle'

type DriveLifecycleRouteDeps = {
    storageLifecycleService: StorageLifecycleService
    uploadServerSecret: string
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
