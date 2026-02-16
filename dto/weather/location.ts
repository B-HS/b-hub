import { z } from 'zod'

export const locationSchema = z.object({
    code: z.string(),
    level1: z.string(),
    level2: z.string().nullable(),
    level3: z.string().nullable(),
    gridX: z.number(),
    gridY: z.number(),
    longitude: z.number(),
    latitude: z.number(),
})

export type LocationData = z.infer<typeof locationSchema>

export const convertQuerySchema = z.object({
    lat: z.coerce.number().optional(),
    lon: z.coerce.number().optional(),
    gridX: z.coerce.number().int().optional(),
    gridY: z.coerce.number().int().optional(),
})

export const latLonConvertResponseSchema = z.object({
    gridX: z.number(),
    gridY: z.number(),
    nearestLocation: locationSchema.nullable(),
})

export const gridConvertResponseSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    location: locationSchema.nullable(),
})
