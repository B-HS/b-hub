import { asc, desc, eq, like, sql, and, isNull } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createDriveAssetService } from '../service/domain/drive/drive-asset'
import { createDriveFolderService } from '../service/domain/drive/drive-folder'
import type { ComposeDriveArgs } from './types'

export const composeDrive = ({ db, storageService, imageProcessor }: ComposeDriveArgs) => {
    const folderDb = {
        insert: async (data: { id: string; userId: string; parentId: string | null; name: string }) => {
            await db.insert(schema.driveFolders).values(data)
        },

        getById: async (id: string) => {
            const [row] = await db.select().from(schema.driveFolders).where(eq(schema.driveFolders.id, id)).limit(1)
            return row ?? null
        },

        getByParent: async (userId: string, parentId: string | null) => {
            const conditions = [eq(schema.driveFolders.userId, userId)]
            if (parentId === null) {
                conditions.push(isNull(schema.driveFolders.parentId))
            } else {
                conditions.push(eq(schema.driveFolders.parentId, parentId))
            }
            return db
                .select()
                .from(schema.driveFolders)
                .where(and(...conditions))
                .orderBy(asc(schema.driveFolders.name))
        },

        getByNameAndParent: async (userId: string, name: string, parentId: string | null) => {
            const conditions = [eq(schema.driveFolders.userId, userId), eq(schema.driveFolders.name, name)]
            if (parentId === null) {
                conditions.push(isNull(schema.driveFolders.parentId))
            } else {
                conditions.push(eq(schema.driveFolders.parentId, parentId))
            }
            const [row] = await db
                .select()
                .from(schema.driveFolders)
                .where(and(...conditions))
                .limit(1)
            return row ?? null
        },

        update: async (id: string, data: Partial<{ name: string; parentId: string | null }>) => {
            await db.update(schema.driveFolders).set(data).where(eq(schema.driveFolders.id, id))
        },

        remove: async (id: string) => {
            await db.delete(schema.driveFolders).where(eq(schema.driveFolders.id, id))
        },
    }

    const driveFolderService = createDriveFolderService({
        db: folderDb,
        generateId: () => crypto.randomUUID(),
    })

    const driveAssetService = createDriveAssetService({
        storage: storageService,
        imageProcessor,
        folderDb: {
            getById: async (id) => {
                const folder = await folderDb.getById(id)
                return folder ? { id: folder.id, userId: folder.userId } : null
            },
        },
        db: {
            insert: async (data) => {
                const [result] = await db
                    .insert(schema.cloudAssets)
                    .values({
                        userId: data.userId,
                        s3Key: data.s3Key,
                        originalName: data.originalName,
                        mimeType: data.mimeType,
                        sizeBytes: data.sizeBytes,
                        fileHash: data.fileHash,
                        folderId: data.folderId,
                        thumbnailBlob: data.thumbnailBlob,
                        isPublic: data.isPublic,
                    })
                    .$returningId()
                return { id: result.id }
            },

            getById: async (id) => {
                const [row] = await db.select().from(schema.cloudAssets).where(eq(schema.cloudAssets.id, id)).limit(1)
                return row ?? null
            },

            getByUserAndHash: async (userId, fileHash) => {
                const [row] = await db
                    .select()
                    .from(schema.cloudAssets)
                    .where(and(eq(schema.cloudAssets.userId, userId), eq(schema.cloudAssets.fileHash, fileHash)))
                    .limit(1)
                return row ?? null
            },

            list: async (params) => {
                const conditions = [eq(schema.cloudAssets.userId, params.userId)]
                if (params.mimeType) {
                    conditions.push(like(schema.cloudAssets.mimeType, `${params.mimeType}%`))
                }
                if (params.folderId !== undefined) {
                    if (params.folderId === 'root') {
                        conditions.push(isNull(schema.cloudAssets.folderId))
                    } else {
                        conditions.push(eq(schema.cloudAssets.folderId, params.folderId))
                    }
                }

                const whereClause = and(...conditions)

                const sortColumn =
                    params.sort === 'name'
                        ? schema.cloudAssets.originalName
                        : params.sort === 'size'
                          ? schema.cloudAssets.sizeBytes
                          : schema.cloudAssets.createdAt
                const orderFn = params.order === 'asc' ? asc : desc

                const data = await db
                    .select()
                    .from(schema.cloudAssets)
                    .where(whereClause)
                    .orderBy(orderFn(sortColumn))
                    .limit(params.limit)
                    .offset(params.offset)

                const [{ count }] = await db
                    .select({ count: sql<number>`COUNT(*)` })
                    .from(schema.cloudAssets)
                    .where(whereClause)

                return { data, total: count }
            },

            update: async (id, data) => {
                await db.update(schema.cloudAssets).set(data).where(eq(schema.cloudAssets.id, id))
            },

            remove: async (id) => {
                await db.delete(schema.cloudAssets).where(eq(schema.cloudAssets.id, id))
            },

            getTotalSizeByUser: async (userId) => {
                const [result] = await db
                    .select({ total: sql<number>`COALESCE(SUM(${schema.cloudAssets.sizeBytes}), 0)` })
                    .from(schema.cloudAssets)
                    .where(eq(schema.cloudAssets.userId, userId))
                return result.total
            },
        },
        generateId: () => crypto.randomUUID(),
        defaultQuotaBytes: 10 * 1024 * 1024,
        getUserQuotaBytes: async (userId: string) => {
            const [row] = await db
                .select({ storageQuotaBytes: schema.user.storageQuotaBytes })
                .from(schema.user)
                .where(eq(schema.user.id, userId))
                .limit(1)
            return row?.storageQuotaBytes ?? 10 * 1024 * 1024
        },
    })

    return { driveAssetService, driveFolderService }
}
