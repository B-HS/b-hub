import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createResumeService } from '../service/domain/resume/resume'
import type { ComposeResumeArgs } from './types'

const ADMIN_ROLE = 'admin'

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

            getLatestResumeByTypePreferringAdmin: async (type) => {
                const [resume] = await db
                    .select(getTableColumns(schema.resumes))
                    .from(schema.resumes)
                    .leftJoin(schema.user, eq(schema.resumes.userId, schema.user.id))
                    .where(eq(schema.resumes.type, type))
                    .orderBy(desc(sql`${schema.user.role} = ${ADMIN_ROLE}`), desc(schema.resumes.updatedAt))
                    .limit(1)
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
                if (Object.keys(updateData).length === 0) return
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
