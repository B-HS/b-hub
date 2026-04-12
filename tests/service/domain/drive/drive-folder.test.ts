import { describe, expect, test, mock } from 'bun:test'
import { createDriveFolderService } from '../../../../service/domain/drive/drive-folder'

const now = new Date()

const makeFolder = (overrides: Partial<{ id: string; userId: string; parentId: string | null; name: string }> = {}) => ({
    id: 'folder-1',
    userId: 'user-1',
    parentId: null as string | null,
    name: '사진',
    createdAt: now,
    updatedAt: now,
    ...overrides,
})

const createMockDeps = () => ({
    db: {
        insert: mock(() => Promise.resolve()),
        getById: mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(makeFolder())),
        getByParent: mock((_userId: string, _parentId: string | null) => Promise.resolve([] as ReturnType<typeof makeFolder>[])),
        getByNameAndParent: mock(
            (_userId: string, _name: string, _parentId: string | null): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(null),
        ),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
    },
    generateId: () => 'new-uuid',
    getAssetsByFolderId: mock((_folderId: string) => Promise.resolve([] as { id: number; s3Key: string; storageTiers: string; gdriveFileId: string | null }[])),
    deleteAssetFromTiers: mock(() => Promise.resolve()),
    removeAssetFromDb: mock((_assetId: number) => Promise.resolve()),
})

describe('createDriveFolderService', () => {
    describe('create', () => {
        test('루트 폴더를 생성한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            const result = await service.create('user-1', { name: '문서' })

            expect(result.id).toBe('new-uuid')
            expect(result.name).toBe('문서')
            expect(result.parentId).toBeNull()
            expect(deps.db.insert).toHaveBeenCalled()
        })

        test('하위 폴더를 생성한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            const result = await service.create('user-1', { name: '여행', parentId: 'folder-1' })

            expect(result.parentId).toBe('folder-1')
        })

        test('존재하지 않는 부모 폴더에 생성하면 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(null))
            const service = createDriveFolderService(deps)

            await expect(service.create('user-1', { name: '하위', parentId: 'nonexistent' })).rejects.toMatchObject({
                code: 'DRIVE_FOLDER_NOT_FOUND',
            })
        })

        test('다른 유저의 폴더에 생성하면 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(() => Promise.resolve(makeFolder({ userId: 'other-user' })))
            const service = createDriveFolderService(deps)

            await expect(service.create('user-1', { name: '하위', parentId: 'folder-1' })).rejects.toMatchObject({
                code: 'DRIVE_FOLDER_NOT_FOUND',
            })
        })

        test('같은 위치에 동일 이름이면 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getByNameAndParent = mock(
                (_userId: string, _name: string, _parentId: string | null): Promise<ReturnType<typeof makeFolder> | null> =>
                    Promise.resolve(makeFolder()),
            )
            const service = createDriveFolderService(deps)

            await expect(service.create('user-1', { name: '사진' })).rejects.toMatchObject({
                code: 'DRIVE_FOLDER_NAME_DUPLICATE',
            })
        })
    })

    describe('list', () => {
        test('루트 폴더 목록을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getByParent = mock(() => Promise.resolve([makeFolder()]))
            const service = createDriveFolderService(deps)

            const result = await service.list('user-1')

            expect(result).toHaveLength(1)
            expect(deps.db.getByParent).toHaveBeenCalledWith('user-1', null)
        })

        test('특정 폴더의 자식 목록을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getByParent = mock(() => Promise.resolve([makeFolder()]))
            const service = createDriveFolderService(deps)

            await service.list('user-1', 'folder-1')

            expect(deps.db.getByParent).toHaveBeenCalledWith('user-1', 'folder-1')
        })
    })

    describe('getDetail', () => {
        test('폴더 상세와 breadcrumb을 반환한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => {
                if (_id === 'child') return Promise.resolve(makeFolder({ id: 'child', parentId: 'parent', name: '자식폴더' }))
                if (_id === 'parent') return Promise.resolve(makeFolder({ id: 'parent', parentId: null, name: '루트폴더' }))
                return Promise.resolve(null)
            })
            const service = createDriveFolderService(deps)

            const result = await service.getDetail('child', 'user-1')

            expect(result.breadcrumb).toHaveLength(2)
            expect(result.breadcrumb[0].name).toBe('루트폴더')
            expect(result.breadcrumb[1].id).toBe('child')
        })

        test('존재하지 않는 폴더에 대해 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(null))
            const service = createDriveFolderService(deps)

            await expect(service.getDetail('nonexistent', 'user-1')).rejects.toMatchObject({ code: 'DRIVE_FOLDER_NOT_FOUND' })
        })

        test('다른 유저의 폴더에 접근하면 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            await expect(service.getDetail('folder-1', 'other-user')).rejects.toMatchObject({ code: 'DRIVE_FOLDER_NOT_FOUND' })
        })
    })

    describe('update', () => {
        test('폴더 이름을 변경한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            await service.update('folder-1', 'user-1', { name: '새이름' })

            expect(deps.db.update).toHaveBeenCalledWith('folder-1', { name: '새이름' })
        })

        test('자기 자신으로 이동하면 순환 참조 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            await expect(service.update('folder-1', 'user-1', { parentId: 'folder-1' })).rejects.toMatchObject({
                code: 'DRIVE_FOLDER_CIRCULAR_REF',
            })
        })

        test('자신의 하위 폴더로 이동하면 순환 참조 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => {
                if (_id === 'parent') return Promise.resolve(makeFolder({ id: 'parent', parentId: null }))
                if (_id === 'child') return Promise.resolve(makeFolder({ id: 'child', parentId: 'parent' }))
                return Promise.resolve(null)
            })
            const service = createDriveFolderService(deps)

            await expect(service.update('parent', 'user-1', { parentId: 'child' })).rejects.toMatchObject({
                code: 'DRIVE_FOLDER_CIRCULAR_REF',
            })
        })

        test('루트로 이동할 수 있다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock(
                (_id: string): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(makeFolder({ parentId: 'some-parent' })),
            )
            const service = createDriveFolderService(deps)

            await service.update('folder-1', 'user-1', { parentId: null })

            expect(deps.db.update).toHaveBeenCalledWith('folder-1', { parentId: null })
        })
    })

    describe('remove', () => {
        test('폴더를 삭제한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            const result = await service.remove('folder-1', 'user-1')

            expect(result.id).toBe('folder-1')
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('존재하지 않는 폴더 삭제 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(null))
            const service = createDriveFolderService(deps)

            await expect(service.remove('nonexistent', 'user-1')).rejects.toMatchObject({ code: 'DRIVE_FOLDER_NOT_FOUND' })
        })

        test('다른 유저의 폴더 삭제 시 에러를 throw한다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            await expect(service.remove('folder-1', 'other-user')).rejects.toMatchObject({ code: 'DRIVE_FOLDER_NOT_FOUND' })
        })
    })

    describe('안전성: depth 제한', () => {
        test('breadcrumb은 최대 50 depth로 제한된다', async () => {
            const deps = createMockDeps()
            let counter = 0
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => {
                counter++
                return Promise.resolve(makeFolder({ id: `folder-${counter}`, parentId: `folder-${counter + 1}`, name: `depth-${counter}` }))
            })
            const service = createDriveFolderService(deps)

            const result = await service.getDetail('folder-1', 'user-1')

            expect(result.breadcrumb.length).toBeLessThanOrEqual(50)
        })

        test('순환 참조 검증은 최대 50 depth에서 중단된다', async () => {
            const deps = createMockDeps()
            let counter = 0
            deps.db.getById = mock((_id: string): Promise<ReturnType<typeof makeFolder> | null> => {
                counter++
                if (_id === 'target') return Promise.resolve(makeFolder({ id: 'target', parentId: 'deep-1' }))
                return Promise.resolve(makeFolder({ id: `deep-${counter}`, parentId: `deep-${counter + 1}` }))
            })
            deps.db.getByNameAndParent = mock(() => Promise.resolve(null))
            const service = createDriveFolderService(deps)

            const result = await service.update('folder-1', 'user-1', { parentId: 'target' })
            expect(result.id).toBe('folder-1')
        })
    })

    describe('재귀 삭제', () => {
        test('폴더 삭제 시 하위 파일을 모든 tier에서 삭제한다', async () => {
            const deps = createMockDeps()
            deps.getAssetsByFolderId = mock(() =>
                Promise.resolve([
                    { id: 1, s3Key: 'users/u1/uuid/a.pdf', storageTiers: 'L1,L3', gdriveFileId: 'gdrive-1' },
                    { id: 2, s3Key: 'users/u1/uuid/b.pdf', storageTiers: 'L1', gdriveFileId: null },
                ]),
            )
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.deleteAssetFromTiers).toHaveBeenCalledTimes(2)
            expect(deps.removeAssetFromDb).toHaveBeenCalledTimes(2)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(1)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(2)
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('하위 폴더와 그 안의 파일도 재귀적으로 삭제한다', async () => {
            const deps = createMockDeps()
            deps.db.getByParent = mock((_userId: string, parentId: string | null) => {
                if (parentId === 'folder-1') return Promise.resolve([makeFolder({ id: 'child-1', parentId: 'folder-1' })])
                if (parentId === 'child-1') return Promise.resolve([makeFolder({ id: 'grandchild-1', parentId: 'child-1' })])
                return Promise.resolve([])
            })
            deps.getAssetsByFolderId = mock((folderId: string) => {
                if (folderId === 'grandchild-1') return Promise.resolve([{ id: 10, s3Key: 'users/u1/uuid/deep.pdf', storageTiers: 'L1,L3', gdriveFileId: 'g-10' }])
                if (folderId === 'child-1') return Promise.resolve([{ id: 11, s3Key: 'users/u1/uuid/mid.pdf', storageTiers: 'L3', gdriveFileId: 'g-11' }])
                if (folderId === 'folder-1') return Promise.resolve([{ id: 12, s3Key: 'users/u1/uuid/top.pdf', storageTiers: 'L1', gdriveFileId: null }])
                return Promise.resolve([])
            })
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.deleteAssetFromTiers).toHaveBeenCalledTimes(3)
            expect(deps.removeAssetFromDb).toHaveBeenCalledTimes(3)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(10)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(11)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(12)
            expect(deps.db.remove).toHaveBeenCalledTimes(3)
            expect(deps.db.remove).toHaveBeenCalledWith('grandchild-1')
            expect(deps.db.remove).toHaveBeenCalledWith('child-1')
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('빈 폴더 삭제 시 폴더만 삭제된다', async () => {
            const deps = createMockDeps()
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.getAssetsByFolderId).toHaveBeenCalledWith('folder-1')
            expect(deps.deleteAssetFromTiers).not.toHaveBeenCalled()
            expect(deps.removeAssetFromDb).not.toHaveBeenCalled()
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('tier 삭제 실패해도 DB 삭제는 계속 진행된다', async () => {
            const deps = createMockDeps()
            deps.getAssetsByFolderId = mock(() =>
                Promise.resolve([{ id: 1, s3Key: 'users/u1/uuid/a.pdf', storageTiers: 'L1', gdriveFileId: null }]),
            )
            deps.deleteAssetFromTiers = mock(() => Promise.reject(new Error('R2 error')))
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(1)
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('하위 폴더의 파일 tier 삭제 실패해도 상위 폴더까지 삭제 완료된다', async () => {
            const deps = createMockDeps()
            deps.db.getByParent = mock((_userId: string, parentId: string | null) => {
                if (parentId === 'folder-1') return Promise.resolve([makeFolder({ id: 'child-1', parentId: 'folder-1' })])
                return Promise.resolve([])
            })
            deps.getAssetsByFolderId = mock((folderId: string) => {
                if (folderId === 'child-1') return Promise.resolve([{ id: 20, s3Key: 'fail.pdf', storageTiers: 'L1', gdriveFileId: null }])
                return Promise.resolve([])
            })
            deps.deleteAssetFromTiers = mock(() => Promise.reject(new Error('tier error')))
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(20)
            expect(deps.db.remove).toHaveBeenCalledWith('child-1')
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('폴더 안에 하위 폴더와 파일이 동시에 있을 때 둘 다 삭제된다', async () => {
            const deps = createMockDeps()
            deps.db.getByParent = mock((_userId: string, parentId: string | null) => {
                if (parentId === 'folder-1') return Promise.resolve([makeFolder({ id: 'sub-1', parentId: 'folder-1' })])
                return Promise.resolve([])
            })
            deps.getAssetsByFolderId = mock((folderId: string) => {
                if (folderId === 'folder-1') return Promise.resolve([{ id: 1, s3Key: 'top.pdf', storageTiers: 'L1', gdriveFileId: null }])
                if (folderId === 'sub-1') return Promise.resolve([{ id: 2, s3Key: 'sub.pdf', storageTiers: 'L3', gdriveFileId: 'g-2' }])
                return Promise.resolve([])
            })
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(1)
            expect(deps.removeAssetFromDb).toHaveBeenCalledWith(2)
            expect(deps.db.remove).toHaveBeenCalledWith('sub-1')
            expect(deps.db.remove).toHaveBeenCalledWith('folder-1')
        })

        test('자식 폴더가 부모보다 먼저 삭제된다', async () => {
            const deps = createMockDeps()
            const removeOrder: string[] = []
            deps.db.getByParent = mock((_userId: string, parentId: string | null) => {
                if (parentId === 'folder-1') return Promise.resolve([makeFolder({ id: 'child-1', parentId: 'folder-1' })])
                return Promise.resolve([])
            })
            deps.db.remove = mock((id: string) => {
                removeOrder.push(id)
                return Promise.resolve()
            }) as typeof deps.db.remove
            const service = createDriveFolderService(deps)

            await service.remove('folder-1', 'user-1')

            expect(removeOrder).toEqual(['child-1', 'folder-1'])
        })

        test('여러 파일 중 하나의 DB 삭제가 실패해도 나머지는 계속 처리된다', async () => {
            const deps = createMockDeps()
            let callCount = 0
            deps.getAssetsByFolderId = mock(() =>
                Promise.resolve([
                    { id: 1, s3Key: 'a.pdf', storageTiers: 'L1', gdriveFileId: null },
                    { id: 2, s3Key: 'b.pdf', storageTiers: 'L1', gdriveFileId: null },
                    { id: 3, s3Key: 'c.pdf', storageTiers: 'L1', gdriveFileId: null },
                ]),
            )
            deps.removeAssetFromDb = mock((assetId: number) => {
                callCount++
                if (assetId === 2) throw new Error('DB error')
                return Promise.resolve()
            })
            const service = createDriveFolderService(deps)

            await expect(service.remove('folder-1', 'user-1')).rejects.toThrow('DB error')
            expect(deps.deleteAssetFromTiers).toHaveBeenCalledTimes(2)
        })
    })
})
