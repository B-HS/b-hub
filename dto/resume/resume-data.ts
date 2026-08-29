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

const localizedTextSchema = z.object({
    ko: z.string(),
    en: z.string(),
    jp: z.string(),
})

const cvProjectSchema = z.object({
    title: localizedTextSchema,
    description: z.array(localizedTextSchema),
    skills: z.array(z.string()),
    site: z.string().optional(),
})

const cvCompanySchema = z.object({
    name: localizedTextSchema,
    period: localizedTextSchema,
    location: localizedTextSchema,
    role: localizedTextSchema,
    projects: z.array(cvProjectSchema),
})

const cvSkillGroupSchema = z.object({
    name: localizedTextSchema,
    items: z.array(z.string()),
})

const cvAdditionalExperienceSchema = z.object({
    period: localizedTextSchema,
    description: localizedTextSchema,
})

const cvProfileSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    firstNameReading: localizedTextSchema,
    lastNameReading: localizedTextSchema,
    jobTitle: localizedTextSchema,
    birthday: localizedTextSchema,
    location: localizedTextSchema,
    email: z.string(),
    github: z.string(),
    blog: z.string(),
    introduce: z.array(localizedTextSchema),
})

const cvSeoSchema = z.object({
    title: localizedTextSchema,
    description: localizedTextSchema,
})

const cvLabelsSchema = z.object({
    workExperience: localizedTextSchema,
    projects: localizedTextSchema,
    skills: localizedTextSchema,
    etc: localizedTextSchema,
})

export const cvDataSchema = z.object({
    profile: cvProfileSchema,
    seo: cvSeoSchema,
    labels: cvLabelsSchema,
    workExperiences: z.array(cvCompanySchema),
    personalProjects: cvCompanySchema,
    skillGroups: z.array(cvSkillGroupSchema),
    additionalExperiences: z.array(cvAdditionalExperienceSchema),
})

export type ResumeData = z.infer<typeof resumeDataSchema>
export type CvData = z.infer<typeof cvDataSchema>
