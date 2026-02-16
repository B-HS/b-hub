import { z } from 'zod'

export const coordinatesQuerySchema = z.object({
    nx: z.coerce.number().int().min(1).max(149).optional(),
    ny: z.coerce.number().int().min(1).max(253).optional(),
    location: z.string().optional(),
})

export type CoordinatesQuery = z.infer<typeof coordinatesQuerySchema>

export const versionQuerySchema = z.object({
    ftype: z.enum(['ODAM', 'VSRT', 'SHRT']),
})

export const currentWeatherResponseSchema = z.object({
    gridX: z.number(),
    gridY: z.number(),
    baseDate: z.string(),
    baseTime: z.string(),
    temperature: z.number(),
    humidity: z.number(),
    rainfall: z.number(),
    windDirection: z.number(),
    windSpeed: z.number(),
    windU: z.number(),
    windV: z.number(),
    windDirectionText: z.string(),
    ptyText: z.string(),
})

export const ultraForecastItemSchema = z.object({
    fcstDate: z.string(),
    fcstTime: z.string(),
    temperature: z.number(),
    humidity: z.number(),
    sky: z.number(),
    pty: z.number(),
    rainfall: z.number(),
    lightning: z.number(),
    windDirection: z.number(),
    windSpeed: z.number(),
    skyText: z.string(),
    ptyText: z.string(),
    windDirectionText: z.string(),
})

export const ultraForecastResponseSchema = z.object({
    gridX: z.number(),
    gridY: z.number(),
    forecasts: z.array(ultraForecastItemSchema),
})

export const shortForecastItemSchema = z.object({
    fcstDate: z.string(),
    fcstTime: z.string(),
    temperature: z.number().nullable(),
    tempMin: z.number().nullable(),
    tempMax: z.number().nullable(),
    humidity: z.number().nullable(),
    sky: z.number(),
    pty: z.number(),
    pop: z.number().nullable(),
    rainfall: z.string().nullable(),
    snowfall: z.string().nullable(),
    windDirection: z.number(),
    windSpeed: z.number(),
    skyText: z.string(),
    ptyText: z.string(),
    windDirectionText: z.string(),
    rainfallText: z.string(),
    snowfallText: z.string(),
})

export const shortForecastResponseSchema = z.object({
    gridX: z.number(),
    gridY: z.number(),
    forecasts: z.array(shortForecastItemSchema),
})

export const versionResponseSchema = z.object({
    filetype: z.string(),
    version: z.string(),
})
