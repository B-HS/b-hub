import type { ResumeCreateInput, ResumeUpdateInput, ResumeListQuery } from '../../../dto/resume/resume'
import type { WebResumeData } from '../../../dto/resume/resume-data'

type ResumeRow = {
    id: number
    userId: string
    type: string
    title: string
    data: unknown
    isPublic: boolean
    createdAt: Date
    updatedAt: Date
}

type ResumeServiceDb = {
    getResumesByUserId: (userId: string, query: ResumeListQuery) => Promise<{ resumes: ResumeRow[]; total: number }>
    getResumeById: (id: number) => Promise<ResumeRow | null>
    getLatestResumeByTypePreferringAdmin: (type: string) => Promise<ResumeRow | null>
    insertResume: (data: { userId: string; type: string; title: string; data: unknown; isPublic: boolean }) => Promise<{ id: number }>
    updateResume: (id: number, data: { title?: string; data?: unknown; isPublic?: boolean }) => Promise<void>
    deleteResume: (id: number) => Promise<void>
}

type ResumeServiceDeps = {
    db: ResumeServiceDb
}

export const createResumeService = (deps: ResumeServiceDeps) => ({
    list: async (userId: string, query: ResumeListQuery) => {
        return deps.db.getResumesByUserId(userId, query)
    },

    getPublicWebResume: async () => {
        return deps.db.getLatestResumeByTypePreferringAdmin('web')
    },

    updateWebResume: async (data: WebResumeData) => {
        const existing = await deps.db.getLatestResumeByTypePreferringAdmin('web')
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        await deps.db.updateResume(existing.id, { data })
        return { success: true as const }
    },

    getById: async (id: number, userId: string) => {
        const resume = await deps.db.getResumeById(id)
        if (!resume) return { success: false as const, reason: 'not_found' as const }
        if (resume.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        return { success: true as const, resume }
    },

    create: async (userId: string, input: ResumeCreateInput) => {
        return deps.db.insertResume({
            userId,
            type: input.type,
            title: input.title,
            data: input.data,
            isPublic: input.isPublic,
        })
    },

    update: async (id: number, userId: string, input: ResumeUpdateInput) => {
        const existing = await deps.db.getResumeById(id)
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        if (existing.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        await deps.db.updateResume(id, input)
        return { success: true as const }
    },

    delete: async (id: number, userId: string) => {
        const existing = await deps.db.getResumeById(id)
        if (!existing) return { success: false as const, reason: 'not_found' as const }
        if (existing.userId !== userId) return { success: false as const, reason: 'not_owner' as const }
        await deps.db.deleteResume(id)
        return { success: true as const }
    },
})

export type ResumeService = ReturnType<typeof createResumeService>
