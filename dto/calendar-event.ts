import { z } from 'zod'

export const recurrenceRuleSchema = z.object({
    freq: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.number().int().positive().optional(),
    count: z.number().int().positive().optional(),
    until: z.string().datetime().optional(),
    byDay: z.array(z.string()).optional(),
    byMonth: z.array(z.number().int().min(1).max(12)).optional(),
    byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
})

export const eventStatusSchema = z.enum(['TENTATIVE', 'CONFIRMED', 'CANCELLED'])

export const eventTransparencySchema = z.enum(['TRANSPARENT', 'OPAQUE'])

export const createEventSchema = z.object({
    summary: z.string().min(1).max(500),
    dtstart: z.coerce.date(),
    dtend: z.coerce.date(),
    isAllDay: z.boolean().default(false),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    rrule: recurrenceRuleSchema.optional(),
    status: eventStatusSchema.optional(),
    transp: eventTransparencySchema.optional(),
    priority: z.number().int().min(0).max(9).optional(),
    categories: z.array(z.string()).optional(),
    color: z.string().optional(),
})

export const updateEventSchema = z.object({
    summary: z.string().min(1).max(500).optional(),
    dtstart: z.coerce.date().optional(),
    dtend: z.coerce.date().optional(),
    isAllDay: z.boolean().optional(),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    rrule: recurrenceRuleSchema.optional().nullable(),
    exdate: z.array(z.string()).optional().nullable(),
    status: eventStatusSchema.optional().nullable(),
    transp: eventTransparencySchema.optional().nullable(),
    priority: z.number().int().min(0).max(9).optional().nullable(),
    categories: z.array(z.string()).optional().nullable(),
    color: z.string().optional().nullable(),
})

export const monthQuerySchema = z.object({
    year: z
        .string()
        .regex(/^\d{4}$/)
        .transform(Number),
    month: z
        .string()
        .regex(/^\d{1,2}$/)
        .transform(Number)
        .refine((m) => m >= 0 && m <= 11, 'month는 0부터 11 사이의 값이어야 합니다'),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type MonthQuery = z.infer<typeof monthQuerySchema>
