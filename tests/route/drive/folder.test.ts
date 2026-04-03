import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createDriveFolderRoute } from '../../../route/drive/folder'
import { createAppError } from '../../../lib/error'

const createMockDeps = () => ({
    driveFolderService: {
        create: mock(() => Promise.resolve({ id: 'folder-1', userId: 'user-1', parentId: null, name: '사진' })),
        list: mock(() =>
            Promise.resolve([{ id: 'folder-1', userId: 'user-1', parentId: null, name: '사진', createdAt: new Date(), updatedAt: new Date() }]),
        ),
        getDetail: mock(() =>
            Promise.resolve({
                id: 'folder-1',
                name: '사진',
                parentId: null,
                breadcrumb: [{ id: 'folder-1', name: '사진' }],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            }),
        ),
        update: mock(() => Promise.resolve({ id: 'folder-1' })),
        remove: mock(() => Promise.resolve({ id: 'folder-1' })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/drive/folders', createDriveFolderRoute(deps))
    return { app, deps }
}

describe('POST /drive/folders', () => {
    test('폴더를 생성한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '사진' }),
        })
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.data.name).toBe('사진')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)

        const res = await app.request('/drive/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '사진' }),
        })
        expect(res.status).toBe(401)
    })
})

describe('GET /drive/folders', () => {
    test('루트 폴더 목록을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/folders')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(1)
    })

    test('특정 부모의 자식 폴더를 조회한다', async () => {
        const { app, deps } = createApp()
        await app.request('/drive/folders?parentId=folder-1')
        expect(deps.driveFolderService.list).toHaveBeenCalledWith('user-1', 'folder-1')
    })
})

describe('GET /drive/folders/:folderId', () => {
    test('폴더 상세를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/folders/folder-1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.breadcrumb).toHaveLength(1)
    })

    test('존재하지 않는 폴더는 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.driveFolderService.getDetail = mock(() => Promise.reject(createAppError('DRIVE_FOLDER_NOT_FOUND')))
        const { app } = createApp(deps)

        const res = await app.request('/drive/folders/nonexistent')
        expect(res.status).toBe(404)
    })
})

describe('PATCH /drive/folders/:folderId', () => {
    test('폴더 이름을 변경한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/folders/folder-1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '새이름' }),
        })
        expect(res.status).toBe(200)
    })

    test('순환 참조 이동은 400을 반환한다', async () => {
        const deps = createMockDeps()
        deps.driveFolderService.update = mock(() => Promise.reject(createAppError('DRIVE_FOLDER_CIRCULAR_REF')))
        const { app } = createApp(deps)

        const res = await app.request('/drive/folders/folder-1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentId: 'child-folder' }),
        })
        expect(res.status).toBe(400)
    })
})

describe('DELETE /drive/folders/:folderId', () => {
    test('폴더를 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/folders/folder-1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe('folder-1')
    })

    test('다른 유저의 폴더 삭제는 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.driveFolderService.remove = mock(() => Promise.reject(createAppError('DRIVE_FOLDER_NOT_FOUND')))
        const { app } = createApp(deps)

        const res = await app.request('/drive/folders/folder-1', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })
})
