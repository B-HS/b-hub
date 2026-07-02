import { Hono } from 'hono'
import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import { successResponse } from '../../lib/api-response'
import { errorResponses } from '../../dto/error-response'
import { locationSchema } from '../../dto/weather/location'
import { latLonToGrid, gridToLatLon } from '../../service/domain/weather/grid-converter'
import type { LocationService } from '../../service/domain/weather/location'
import type { WeatherApiKeyService } from '../../service/domain/weather/weather-api-key'
import { requireWeatherKey } from '../../middleware/require-weather-key'

type LocationRouteDeps = {
    locationService: LocationService
    weatherApiKeyService: WeatherApiKeyService
}

export const createLocationRoute = (deps: LocationRouteDeps) => {
    const route = new Hono()

    route.use('*', requireWeatherKey({ weatherApiKeyService: deps.weatherApiKeyService }))

    route.get(
        '/',
        describeRoute({
            tags: ['Weather'],
            summary: '전체 위치 목록',
            responses: {
                200: {
                    description: '위치 목록',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: z.array(locationSchema),
                                }),
                            ),
                        },
                    },
                },
            },
        }),
        withErrorHandling(async (c) => {
            const locations = deps.locationService.getAll()
            return c.json(successResponse(locations))
        }),
    )

    route.get(
        '/convert',
        describeRoute({
            tags: ['Weather'],
            summary: '좌표 변환',
            responses: {
                200: { description: '변환 결과' },
                ...errorResponses(['WEATHER_INVALID_GRID']),
            },
        }),
        withErrorHandling(async (c) => {
            const lat = c.req.query('lat')
            const lon = c.req.query('lon')
            const gridX = c.req.query('gridX')
            const gridY = c.req.query('gridY')

            if (lat && lon) {
                const latNum = parseFloat(lat)
                const lonNum = parseFloat(lon)

                if (isNaN(latNum) || isNaN(lonNum)) {
                    throw createAppError('WEATHER_INVALID_GRID')
                }

                const grid = latLonToGrid(latNum, lonNum)
                const nearest = deps.locationService.findNearest(latNum, lonNum)

                return c.json(
                    successResponse({
                        gridX: grid.x,
                        gridY: grid.y,
                        nearestLocation: nearest,
                    }),
                )
            }

            if (gridX && gridY) {
                const x = parseInt(gridX, 10)
                const y = parseInt(gridY, 10)

                if (isNaN(x) || isNaN(y)) {
                    throw createAppError('WEATHER_INVALID_GRID')
                }

                const latLon = gridToLatLon(x, y)
                const location = deps.locationService.getByGrid(x, y)

                return c.json(
                    successResponse({
                        latitude: latLon.lat,
                        longitude: latLon.lon,
                        location,
                    }),
                )
            }

            throw createAppError('WEATHER_INVALID_GRID')
        }),
    )

    route.get(
        '/:keyword',
        describeRoute({
            tags: ['Weather'],
            summary: '위치 검색',
            responses: {
                200: {
                    description: '검색 결과',
                    content: {
                        'application/json': {
                            schema: resolver(
                                z.object({
                                    success: z.literal(true),
                                    data: z.array(locationSchema),
                                }),
                            ),
                        },
                    },
                },
            },
        }),
        withErrorHandling(async (c) => {
            const keyword = c.req.param('keyword')!
            if (keyword.length > 100) throw createAppError('VALIDATION_ERROR')
            const results = deps.locationService.search(keyword)
            return c.json(successResponse(results))
        }),
    )

    return route
}
