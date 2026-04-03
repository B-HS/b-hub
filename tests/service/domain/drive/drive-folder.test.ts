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
        getByParent: mock(() => Promise.resolve([makeFolder()])),
        getByNameAndParent: mock(
            (_userId: string, _name: string, _parentId: string | null): Promise<ReturnType<typeof makeFolder> | null> => Promise.resolve(null),
        ),
        update: mock(() => Promise.resolve()),
        remove: mock(() => Promise.resolve()),
    },
    generateId: () => 'new-uuid',
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
            const service = createDriveFolderService(deps)

            const result = await service.list('user-1')

            expect(result).toHaveLength(1)
            expect(deps.db.getByParent).toHaveBeenCalledWith('user-1', null)
        })

        test('특정 폴더의 자식 목록을 반환한다', async () => {
            const deps = createMockDeps()
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
})
