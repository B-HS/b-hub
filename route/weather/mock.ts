import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
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
import type { ErrorCode } from '../../lib/error-code'
import type { KmaApiService } from '../../service/domain/weather/kma-api'
import type { LocationService } from '../../service/domain/weather/location'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import { requireWeatherKeyNoLog } from '../../middleware/require-weather-key'

type WeatherMockRouteDeps = {
    mockKmaApi: KmaApiService
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

export const createWeatherMockRoute = (deps: WeatherMockRouteDeps) => {
    const route = new Hono()

    route.use('*', requireWeatherKeyNoLog({ weatherApiKeyService: deps.weatherApiKeyService }))

    route.get(
        '/current',
        describeRoute({
            tags: ['Weather Mock'],
            summary: '현재 날씨 Mock 조회',
            responses: {
                200: {
                    description: '현재 날씨 (Mock)',
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

            const result = await deps.mockKmaApi.getUltraSrtNcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError(result.error.code as ErrorCode, { detail: result.error.message })
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
            tags: ['Weather Mock'],
            summary: '초단기예보 Mock 조회',
            responses: {
                200: {
                    description: '초단기예보 (Mock)',
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

            const result = await deps.mockKmaApi.getUltraSrtFcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError(result.error.code as ErrorCode, { detail: result.error.message })
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
            tags: ['Weather Mock'],
            summary: '단기예보 Mock 조회',
            responses: {
                200: {
                    description: '단기예보 (Mock)',
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

            const result = await deps.mockKmaApi.getVilageFcst(coords.gridX, coords.gridY)
            if (!result.success) {
                throw createAppError(result.error.code as ErrorCode, { detail: result.error.message })
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
            tags: ['Weather Mock'],
            summary: '예보 버전 Mock 조회',
            responses: {
                200: {
                    description: '버전 정보 (Mock)',
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
            const result = await deps.mockKmaApi.getFcstVersion(query.ftype)

            if (!result.success) {
                throw createAppError(result.error.code as ErrorCode, { detail: result.error.message })
            }

            return c.json(successResponse(result.data))
        }),
    )

    return route
}
