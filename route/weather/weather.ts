import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { resolver, validator } from 'hono-openapi/zod'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import {
    coordinatesQuerySchema,
    versionQuerySchema,
    currentWeatherResponseSchema,
    ultraForecastResponseSchema,
    shortForecastResponseSchema,
    versionResponseSchema,
} from '../../dto/weather/weather'
import { parseCurrentWeather, parseUltraForecasts, parseShortForecasts } from '../../service/domain/weather/weather-data'
import type { KmaApiService } from '../../service/domain/weather/kma-api'
import type { LocationService } from '../../service/domain/weather/location'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import { requireWeatherKey } from '../../middleware/require-weather-key'

type WeatherRouteDeps = {
    kmaApi: KmaApiService
    locationService: LocationService
    weatherApiKeyService: WeatherApiKeyService
}

const resolveCoordinates = (nx: number | undefined, ny: number | undefined, location: string | undefined, locationService: LocationService) => {
    if (nx !== undefined && ny !== undefined) {
        return { gridX: nx, gridY: ny }
    }

    if (location) {
        const results = locationService.search(location)
        if (results.length > 0) {
            return { gridX: results[0].gridX, gridY: results[0].gridY }
        }
    }

    return null
}

export const createWeatherRoute = (deps: WeatherRouteDeps) => {
    const route = new Hono()

    route.use('*', requireWeatherKey({ weatherApiKeyService: deps.weatherApiKeyService }))

    route.get(
        '/current',
        describeRoute({
            tags: ['Weather'],
            summary: '현재 날씨 조회',
            responses: {
                200: {
                    description: '현재 날씨',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: currentWeatherResponseSchema,
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['WEATHER_KMA_API_ERROR', 'WEATHER_INVALID_GRID']),
            },
        }),
        validator('query', coordinatesQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof coordinatesQuerySchema>
            const coords = resolveCoordinates(query.nx, query.ny, query.location, deps.locationService)

            if (!coords) {
                throw createAppError('WEATHER_INVALID_GRID')
            }

            const result = await deps.kmaApi.getUltraSrtNcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError('WEATHER_KMA_API_ERROR', {
                    detail: result.error.message,
                })
            }

            const now = new Date()
            const baseDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
            const baseTime = `${String(now.getHours()).padStart(2, '0')}00`

            const parsed = parseCurrentWeather(result.data)

            return c.json(
                successResponse({
                    gridX: coords.gridX,
                    gridY: coords.gridY,
                    baseDate,
                    baseTime,
                    ...parsed,
                }),
            )
        }),
    )

    route.get(
        '/ultra-short',
        describeRoute({
            tags: ['Weather'],
            summary: '초단기예보 조회',
            responses: {
                200: {
                    description: '초단기예보',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: ultraForecastResponseSchema,
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['WEATHER_KMA_API_ERROR', 'WEATHER_INVALID_GRID']),
            },
        }),
        validator('query', coordinatesQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof coordinatesQuerySchema>
            const coords = resolveCoordinates(query.nx, query.ny, query.location, deps.locationService)

            if (!coords) {
                throw createAppError('WEATHER_INVALID_GRID')
            }

            const result = await deps.kmaApi.getUltraSrtFcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError('WEATHER_KMA_API_ERROR', {
                    detail: result.error.message,
                })
            }

            const forecasts = parseUltraForecasts(result.data)

            return c.json(
                successResponse({
                    gridX: coords.gridX,
                    gridY: coords.gridY,
                    forecasts,
                }),
            )
        }),
    )

    route.get(
        '/short-term',
        describeRoute({
            tags: ['Weather'],
            summary: '단기예보 조회',
            responses: {
                200: {
                    description: '단기예보',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: shortForecastResponseSchema,
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['WEATHER_KMA_API_ERROR', 'WEATHER_INVALID_GRID']),
            },
        }),
        validator('query', coordinatesQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof coordinatesQuerySchema>
            const coords = resolveCoordinates(query.nx, query.ny, query.location, deps.locationService)

            if (!coords) {
                throw createAppError('WEATHER_INVALID_GRID')
            }

            const result = await deps.kmaApi.getVilageFcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError('WEATHER_KMA_API_ERROR', {
                    detail: result.error.message,
                })
            }

            const forecasts = parseShortForecasts(result.data)

            return c.json(
                successResponse({
                    gridX: coords.gridX,
                    gridY: coords.gridY,
                    forecasts,
                }),
            )
        }),
    )

    route.get(
        '/version',
        describeRoute({
            tags: ['Weather'],
            summary: '예보 버전 조회',
            responses: {
                200: {
                    description: '버전 정보',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: versionResponseSchema,
                                }),
                            ),
                        },
                    },
                },
                ...errorResponses(['WEATHER_KMA_API_ERROR']),
            },
        }),
        validator('query', versionQuerySchema),
        withErrorHandling(async (c) => {
            const query = c.req.valid('query' as never) as z.infer<typeof versionQuerySchema>
            const result = await deps.kmaApi.getFcstVersion(query.ftype)

            if (!result.success) {
                throw createAppError('WEATHER_KMA_API_ERROR', {
                    detail: result.error.message,
                })
            }

            return c.json(successResponse(result.data))
        }),
    )

    return route
}
