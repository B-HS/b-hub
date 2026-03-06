import type { Context, Next } from 'hono'
import { createAppError } from '../lib/error'
import type { WeatherApiKeyService } from '../service/domain/weather/weather-api-key'

type RequireWeatherKeyDeps = {
    weatherApiKeyService: WeatherApiKeyService
}

export const requireWeatherKey = (deps: RequireWeatherKeyDeps) => async (c: Context, next: Next) => {
    const token = c.req.header('X-Weather-Key')
    if (!token) throw createAppError('WEATHER_KEY_INVALID')

    const keyRecord = await deps.weatherApiKeyService.validate(token)
    if (!keyRecord) throw createAppError('WEATHER_KEY_INVALID')

    const allowed = await deps.weatherApiKeyService.checkRateLimit(keyRecord.id, keyRecord.dailyLimit)
    if (!allowed) throw createAppError('WEATHER_KEY_RATE_LIMIT')

    c.set('user', { id: keyRecord.userId, name: '', email: '', role: null, image: null })
    c.set('weatherKeyId' as never, keyRecord.id as never)
    c.set('weatherKeyUserId' as never, keyRecord.userId as never)

    const start = Date.now()
    await next()
    const durationMs = Date.now() - start

    const errorCode = (() => {
        try {
            return c.get('errorCode') ?? null
        } catch {
            return null
        }
    })()

    deps.weatherApiKeyService.logRequest({
        keyId: keyRecord.id,
        userId: keyRecord.userId,
        endpoint: c.req.path,
        statusCode: c.res.status,
        ip: c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent'),
        durationMs,
        errorCode: errorCode ?? undefined,
    })
}

export const requireWeatherKeyNoLog = (deps: RequireWeatherKeyDeps) => async (c: Context, next: Next) => {
    const token = c.req.header('X-Weather-Key')
    if (!token) throw createAppError('WEATHER_KEY_INVALID')

    const keyRecord = await deps.weatherApiKeyService.validate(token)
    if (!keyRecord) throw createAppError('WEATHER_KEY_INVALID')

    c.set('user', { id: keyRecord.userId, name: '', email: '', role: null, image: null })
    c.set('weatherKeyId' as never, keyRecord.id as never)
    c.set('weatherKeyUserId' as never, keyRecord.userId as never)

    await next()
}
