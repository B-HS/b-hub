import { asc, desc, eq, gte, like, lt, or, sql, and, isNull, isNotNull } from 'drizzle-orm'
import * as schema from '../db/schema'
import { createDriveAssetService } from '../service/domain/drive/drive-asset'
import { createDriveFolderService } from '../service/domain/drive/drive-folder'
import { createStorageLifecycleService } from '../service/shared/storage-lifecycle'
import { isDuplicateKeyError } from '../lib/db-helper'
import type { ComposeDriveArgs } from './types'

export const composeDrive = ({ db, env, storageService, imageProcessor, initGdriveStorage }: ComposeDriveArgs) => {
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

    const parseTiers = (storageTiers: string): Set<string> => new Set(storageTiers.split(',').filter(Boolean))

    const driveFolderService = createDriveFolderService({
        db: folderDb,
        generateId: () => crypto.randomUUID(),
        getAssetsByFolderId: async (folderId: string) => {
            const rows = await db
                .select({
                    id: schema.cloudAssets.id,
                    s3Key: schema.cloudAssets.s3Key,
                    storageTiers: schema.cloudAssets.storageTiers,
                    gdriveFileId: schema.cloudAssets.gdriveFileId,
                })
                .from(schema.cloudAssets)
                .where(eq(schema.cloudAssets.folderId, folderId))
            return rows
        },
        deleteAssetFromTiers: async (asset) => {
            const tiers = parseTiers(asset.storageTiers)
            if (tiers.has('L1')) {
                try {
                    await storageService.del(asset.s3Key)
                } catch {}
            }
            if (tiers.has('L3') && asset.gdriveFileId) {
                try {
                    const gdrive = await initGdriveStorage()
                    if (gdrive) await gdrive.del(asset.gdriveFileId)
                } catch {}
            }
        },
        removeAssetFromDb: async (assetId: number) => {
            await db.delete(schema.cloudAssets).where(eq(schema.cloudAssets.id, assetId))
        },
    })

    const assetDb = {
        insert: async (data: {
            userId: string
            s3Key: string
            originalName: string
            mimeType: string
            sizeBytes: number
            fileHash: string
            folderId: string | null
            thumbnailBlob: Buffer | null
            isPublic: boolean
            uploadStatus: string
            uploadToken: string | null
            localPath: string | null
            gdriveFileId: string | null
            storageTiers: string
            accessCount: number
        }) => {
            try {
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
                        uploadStatus: data.uploadStatus,
                        uploadToken: data.uploadToken,
                        localPath: data.localPath,
                        gdriveFileId: data.gdriveFileId,
                        storageTiers: data.storageTiers,
                        accessCount: data.accessCount,
                    })
                    .$returningId()
                return { id: result.id }
            } catch (error) {
                if (isDuplicateKeyError(error)) return null
                throw error
            }
        },

        getById: async (id: number) => {
            const [row] = await db.select().from(schema.cloudAssets).where(eq(schema.cloudAssets.id, id)).limit(1)
            return row ?? null
        },

        getByUserAndHash: async (userId: string, fileHash: string) => {
            const [row] = await db
                .select()
                .from(schema.cloudAssets)
                .where(and(eq(schema.cloudAssets.userId, userId), eq(schema.cloudAssets.fileHash, fileHash)))
                .limit(1)
            return row ?? null
        },

        list: async (params: {
            userId: string
            limit: number
            offset: number
            mimeType?: string
            folderId?: string
            sort: string
            order: string
        }) => {
            const staleThreshold = new Date(Date.now() - 10 * 60 * 1000)
            const conditions = [
                eq(schema.cloudAssets.userId, params.userId),
                sql`NOT (${schema.cloudAssets.uploadStatus} IN ('preparing', 'failed') AND ${schema.cloudAssets.createdAt} < ${staleThreshold})`,
            ]
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

        update: async (
            id: number,
            data: Partial<{
                originalName: string
                isPublic: boolean
                folderId: string | null
                lastViewedAt: Date
                accessCount: number
                storageTiers: string
                uploadStatus: string
                uploadToken: string | null
                localPath: string | null
                gdriveFileId: string | null
                thumbnailBlob: Buffer | null
                fileHash: string
                sizeBytes: number
            }>,
        ) => {
            try {
                await db.update(schema.cloudAssets).set(data).where(eq(schema.cloudAssets.id, id))
                return { id }
            } catch (error) {
                if (isDuplicateKeyError(error)) return null
                throw error
            }
        },

        remove: async (id: number) => {
            await db.delete(schema.cloudAssets).where(eq(schema.cloudAssets.id, id))
        },

        getTotalSizeByUser: async (userId: string) => {
            const [result] = await db
                .select({ total: sql<number>`COALESCE(SUM(${schema.cloudAssets.sizeBytes}), 0)` })
                .from(schema.cloudAssets)
                .where(eq(schema.cloudAssets.userId, userId))
            return Number(result.total)
        },
    }

    const getUserQuotaBytes = async (userId: string) => {
        const [row] = await db
            .select({ storageQuotaBytes: schema.user.storageQuotaBytes })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1)
        return row?.storageQuotaBytes ?? 10 * 1024 * 1024
    }

    const driveAssetService = createDriveAssetService({
        storage: storageService,
        getGdriveStorage: initGdriveStorage,
        imageProcessor,
        folderDb: {
            getById: async (id) => {
                const folder = await folderDb.getById(id)
                return folder ? { id: folder.id, userId: folder.userId } : null
            },
        },
        db: assetDb,
        generateId: () => crypto.randomUUID(),
        defaultQuotaBytes: 10 * 1024 * 1024,
        getUserQuotaBytes,
        uploadServerSecret: env.UPLOAD_SERVER_SECRET ?? '',
    })

    const storageLifecycleService = createStorageLifecycleService({
        db: {
            getStaleL1Assets: async (olderThan: Date) => {
                const rows = await db
                    .select({ id: schema.cloudAssets.id, s3Key: schema.cloudAssets.s3Key, storageTiers: schema.cloudAssets.storageTiers })
                    .from(schema.cloudAssets)
                    .where(
                        and(
                            like(schema.cloudAssets.storageTiers, '%L1%'),
                            isNotNull(schema.cloudAssets.gdriveFileId),
                            or(
                                lt(schema.cloudAssets.lastViewedAt, olderThan),
                                and(isNull(schema.cloudAssets.lastViewedAt), lt(schema.cloudAssets.createdAt, olderThan)),
                            ),
                        ),
                    )
                    .limit(500)
                return rows
            },
            getPromotionCandidates: async (minAccessCount: number, maxSizeBytes: number, viewedAfter: Date) => {
                const rows = await db
                    .select({
                        id: schema.cloudAssets.id,
                        s3Key: schema.cloudAssets.s3Key,
                        gdriveFileId: schema.cloudAssets.gdriveFileId,
                        storageTiers: schema.cloudAssets.storageTiers,
                        mimeType: schema.cloudAssets.mimeType,
                    })
                    .from(schema.cloudAssets)
                    .where(
                        and(
                            sql`${schema.cloudAssets.storageTiers} NOT LIKE '%L1%'`,
                            sql`${schema.cloudAssets.gdriveFileId} IS NOT NULL`,
                            sql`${schema.cloudAssets.accessCount} >= ${minAccessCount}`,
                            sql`${schema.cloudAssets.sizeBytes} <= ${maxSizeBytes}`,
                            gte(schema.cloudAssets.lastViewedAt, viewedAfter),
                        ),
                    )
                    .limit(50)
                return rows.filter((r): r is typeof r & { gdriveFileId: string } => r.gdriveFileId !== null)
            },
            updateStorageTiers: async (id: number, storageTiers: string) => {
                await db.update(schema.cloudAssets).set({ storageTiers }).where(eq(schema.cloudAssets.id, id))
            },
            insertLifecycleLog: async (data: { assetId: number; action: string; fromTier: string; toTier: string; reason: string }) => {
                await db.insert(schema.storageLifecycleLogs).values(data)
            },
        },
        l1: storageService,
        getL3: initGdriveStorage,
        evictionDays: 30,
        promotionThreshold: 5,
        l1MaxFileSize: 100 * 1024 * 1024,
    })

    return { driveAssetService, driveFolderService, storageLifecycleService, uploadServerSecret: env.UPLOAD_SERVER_SECRET }
}
