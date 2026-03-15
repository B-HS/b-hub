import { z } from 'zod'

const contactInfoSchema = z.object({
    furigana: z.string(),
    postal: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
})

const historyLineSchema = z.object({
    year: z.string(),
    month: z.string(),
    content: z.string(),
})

export const resumeDataSchema = z.object({
    name_furigana: z.string(),
    name: z.string(),
    gender: z.enum(['男', '女', '']),
    birthday_year: z.string(),
    birthday_month: z.string(),
    birthday_day: z.string(),
    age: z.string(),
    photo: z.string(),
    contact: contactInfoSchema,
    emergency: contactInfoSchema,
    history: z.array(historyLineSchema),
    qualifications: z.array(historyLineSchema),
    self_promotion: z.string(),
    commuting_hours: z.string(),
    commuting_minutes: z.string(),
    dependents: z.string(),
    marital_status: z.enum(['有', '無', '']),
    spouse_obligation: z.enum(['有', '無', '']),
    objective: z.string(),
    creation_year: z.string(),
    creation_month: z.string(),
    creation_day: z.string(),
})

const cvExperienceSchema = z.object({
    environments: z.string(),
    languages: z.string(),
    frameworks: z.string(),
    infrastructure: z.string(),
    tools: z.string(),
})

const cvOverviewSchema = z.object({
    title: z.string(),
    period: z.string(),
    content: z.string(),
    tech_stack: z.string(),
})

const cvJobSchema = z.object({
    title: z.string(),
    period_from: z.string(),
    period_to: z.string(),
    period_span: z.string(),
    kind: z.string(),
    role: z.string(),
    size: z.string(),
    content: z.string(),
    lang: z.string(),
    tools: z.string(),
})

export const cvDataSchema = z.object({
    name: z.string(),
    kana: z.string(),
    summary: z.string(),
    experience: cvExperienceSchema,
    overview: z.array(cvOverviewSchema),
    jobs: z.array(cvJobSchema),
})

export type ResumeData = z.infer<typeof resumeDataSchema>
export type CvData = z.infer<typeof cvDataSchema>
