import { and, desc, eq, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createResumeService } from '../service/domain/resume/resume'
import type { ComposeResumeArgs } from './types'

export const composeResume = ({ db }: ComposeResumeArgs) => {
    const resumeService = createResumeService({
        db: {
            getResumesByUserId: async (userId, query) => {
                const conditions = [eq(schema.resumes.userId, userId)]
                if (query.type) conditions.push(eq(schema.resumes.type, query.type))

                const [resumes, [{ total }]] = await Promise.all([
                    db
                        .select()
                        .from(schema.resumes)
                        .where(and(...conditions))
                        .orderBy(desc(schema.resumes.updatedAt))
                        .limit(query.limit)
                        .offset((query.page - 1) * query.limit),
                    db
                        .select({ total: sql<number>`count(*)` })
                        .from(schema.resumes)
                        .where(and(...conditions)),
                ])
                return { resumes, total }
            },

            getResumeById: async (id) => {
                const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, id)).limit(1)
                return resume ?? null
            },

            insertResume: async (data) => {
                const [resume] = await db
                    .insert(schema.resumes)
                    .values({
                        userId: data.userId,
                        type: data.type,
                        title: data.title,
                        data: data.data,
                        isPublic: data.isPublic,
                    })
                    .$returningId()
                return resume
            },

            updateResume: async (id, data) => {
                const updateData: Record<string, unknown> = {}
                if (data.title !== undefined) updateData.title = data.title
                if (data.data !== undefined) updateData.data = data.data
                if (data.isPublic !== undefined) updateData.isPublic = data.isPublic
                await db.update(schema.resumes).set(updateData).where(eq(schema.resumes.id, id))
            },

            deleteResume: async (id) => {
                await db.delete(schema.resumes).where(eq(schema.resumes.id, id))
            },
        },
    })

    return {
        resumeService,
    }
}
