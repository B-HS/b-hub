import { z } from 'zod'
import { resumeDataSchema, cvDataSchema, webResumeDataSchema } from './resume-data'

export const RESUME_TYPE = ['resume', 'cv', 'web'] as const

const resumePayloadSchema = z.object({
    type: z.literal('resume'),
    data: resumeDataSchema,
})

const cvPayloadSchema = z.object({
    type: z.literal('cv'),
    data: cvDataSchema,
})

const webPayloadSchema = z.object({
    type: z.literal('web'),
    data: webResumeDataSchema,
})

export const resumeCreateSchema = z.discriminatedUnion('type', [resumePayloadSchema, cvPayloadSchema, webPayloadSchema]).and(
    z.object({
        title: z.string().min(1).max(255),
        isPublic: z.boolean().default(false),
    }),
)

export const resumeUpdateSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    data: z.union([resumeDataSchema, cvDataSchema, webResumeDataSchema]).optional(),
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
