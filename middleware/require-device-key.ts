import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'
import { resolveDeviceIdentity } from '../service/domain/logs/device-key'
import type { DeviceKeyService } from '../service/domain/logs/device-key'

type RequireDeviceKeyDeps = {
    deviceKeyService: DeviceKeyService
}

export const requireDeviceKey = (deps: RequireDeviceKeyDeps) => async (c: Context, next: Next) => {
    const token = c.req.header('X-Device-Key')
    if (!token) throw createAppError('LOG_DEVICE_KEY_INVALID')

    const keyRecord = await deps.deviceKeyService.validate(token)
    if (!keyRecord) throw createAppError('LOG_DEVICE_KEY_INVALID')

    const deviceIdentity = resolveDeviceIdentity(keyRecord)
    const allowed = await deps.deviceKeyService.checkRateLimit(deviceIdentity, keyRecord.dailyLimit)
    if (!allowed) throw createAppError('LOG_DEVICE_KEY_RATE_LIMIT')

    c.set('deviceKeyId' as never, keyRecord.id as never)
    c.set('deviceKeyDeviceId' as never, deviceIdentity as never)

    await next()
}
