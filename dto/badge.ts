import { z } from 'zod'

export const badgeImageQuerySchema = z.object({
    width: z.coerce.number().int().min(1).max(4096).default(800),
    height: z.coerce.number().int().min(1).max(4096).default(250),
    text: z.string().default('Badge'),
    font: z.string().default('Inter'),
    fontSize: z.coerce.number().int().min(1).max(500).optional(),
    fontWeight: z.coerce.number().int().min(100).max(900).default(400),
    color: z.string().default('#000000'),
    backgroundColor: z.string().default('#ffffff'),
    icon: z.string().default(''),
    iconUrl: z.string().default(''),
    iconSize: z.coerce.number().int().min(0).max(500).default(0),
    tailwind: z.string().default(''),
    css: z.string().default('{}'),
})

export type BadgeImageQuery = z.infer<typeof badgeImageQuerySchema>

export const badgeFontsResponseSchema = z.object({
    local: z.array(
        z.object({
            name: z.string(),
            weights: z.array(z.number()),
        }),
    ),
    googleFontsSupported: z.boolean(),
})
