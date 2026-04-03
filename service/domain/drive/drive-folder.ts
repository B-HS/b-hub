import { createAppError } from '../../../lib/error'

type DriveFolderRow = {
    id: string
    userId: string
    parentId: string | null
    name: string
    createdAt: Date
    updatedAt: Date
}

type DriveFolderServiceDb = {
    insert: (data: { id: string; userId: string; parentId: string | null; name: string }) => Promise<void>
    getById: (id: string) => Promise<DriveFolderRow | null>
    getByParent: (userId: string, parentId: string | null) => Promise<DriveFolderRow[]>
    getByNameAndParent: (userId: string, name: string, parentId: string | null) => Promise<DriveFolderRow | null>
    update: (id: string, data: Partial<{ name: string; parentId: string | null }>) => Promise<void>
    remove: (id: string) => Promise<void>
}

type DriveFolderServiceDeps = {
    db: DriveFolderServiceDb
    generateId: () => string
}

const MAX_DEPTH = 50

const buildBreadcrumb = async (db: DriveFolderServiceDb, folderId: string) => {
    const path: { id: string; name: string }[] = []
    let currentId: string | null = folderId
    let depth = 0
    while (currentId && depth < MAX_DEPTH) {
        const folder = await db.getById(currentId)
        if (!folder) break
        path.unshift({ id: folder.id, name: folder.name })
        currentId = folder.parentId
        depth++
    }
    return path
}

const isDescendant = async (db: DriveFolderServiceDb, ancestorId: string, targetId: string | null): Promise<boolean> => {
    let currentId = targetId
    let depth = 0
    while (currentId && depth < MAX_DEPTH) {
        if (currentId === ancestorId) return true
        const folder = await db.getById(currentId)
        if (!folder) break
        currentId = folder.parentId
        depth++
    }
    return false
}

export const createDriveFolderService = (deps: DriveFolderServiceDeps) => ({
    create: async (userId: string, data: { name: string; parentId?: string | null }) => {
        const parentId = data.parentId ?? null

        if (parentId) {
            const parent = await deps.db.getById(parentId)
            if (!parent || parent.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        }

        const duplicate = await deps.db.getByNameAndParent(userId, data.name, parentId)
        if (duplicate) throw createAppError('DRIVE_FOLDER_NAME_DUPLICATE')

        const id = deps.generateId()
        await deps.db.insert({ id, userId, parentId, name: data.name })

        return { id, userId, parentId, name: data.name }
    },

    list: async (userId: string, parentId?: string) => {
        const resolvedParentId = parentId ?? null
        if (resolvedParentId) {
            const parent = await deps.db.getById(resolvedParentId)
            if (!parent || parent.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        }
        return deps.db.getByParent(userId, resolvedParentId)
    },

    getDetail: async (folderId: string, userId: string) => {
        const folder = await deps.db.getById(folderId)
        if (!folder) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        if (folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')

        const breadcrumb = await buildBreadcrumb(deps.db, folderId)

        return {
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
            breadcrumb,
            createdAt: folder.createdAt.toISOString(),
            updatedAt: folder.updatedAt.toISOString(),
        }
    },

    update: async (folderId: string, userId: string, data: { name?: string; parentId?: string | null }) => {
        const folder = await deps.db.getById(folderId)
        if (!folder) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        if (folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')

        if (data.parentId !== undefined) {
            if (data.parentId === folderId) throw createAppError('DRIVE_FOLDER_CIRCULAR_REF')

            if (data.parentId !== null) {
                const target = await deps.db.getById(data.parentId)
                if (!target || target.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')

                if (await isDescendant(deps.db, folderId, data.parentId)) {
                    throw createAppError('DRIVE_FOLDER_CIRCULAR_REF')
                }
            }
        }

        const newName = data.name ?? folder.name
        const newParentId = data.parentId !== undefined ? data.parentId : folder.parentId

        if (newName !== folder.name || newParentId !== folder.parentId) {
            const duplicate = await deps.db.getByNameAndParent(userId, newName, newParentId)
            if (duplicate && duplicate.id !== folderId) throw createAppError('DRIVE_FOLDER_NAME_DUPLICATE')
        }

        const updateData: Partial<{ name: string; parentId: string | null }> = {}
        if (data.name !== undefined) updateData.name = data.name
        if (data.parentId !== undefined) updateData.parentId = data.parentId

        if (Object.keys(updateData).length > 0) {
            await deps.db.update(folderId, updateData)
        }

        return { id: folderId }
    },

    remove: async (folderId: string, userId: string) => {
        const folder = await deps.db.getById(folderId)
        if (!folder) throw createAppError('DRIVE_FOLDER_NOT_FOUND')
        if (folder.userId !== userId) throw createAppError('DRIVE_FOLDER_NOT_FOUND')

        await deps.db.remove(folderId)

        return { id: folderId }
    },
})

export type DriveFolderService = ReturnType<typeof createDriveFolderService>
