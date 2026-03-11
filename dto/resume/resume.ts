import { z } from 'zod'
import { resumeDataSchema, cvDataSchema } from './resume-data'

export const RESUME_TYPE = ['resume', 'cv'] as const

const resumePayloadSchema = z.object({
    type: z.literal('resume'),
    data: resumeDataSchema,
})

const cvPayloadSchema = z.object({
    type: z.literal('cv'),
    data: cvDataSchema,
})

export const resumeCreateSchema = z
    .discriminatedUnion('type', [resumePayloadSchema, cvPayloadSchema])
    .and(
        z.object({
            title: z.string().min(1).max(255),
            isPublic: z.boolean().default(false),
        }),
    )

export const resumeUpdateSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    data: z.union([resumeDataSchema, cvDataSchema]).optional(),
    isPublic: z.boolean().optional(),
})

export const resumeListQuerySchema = z.object({
    type: z.enum(RESUME_TYPE).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type ResumeCreateInput = z.infer<typeof resumeCreateSchema>
export type ResumeUpdateInput = z.infer<typeof resumeUpdateSchema>
export type ResumeListQuery = z.infer<typeof resumeListQuerySchema>
