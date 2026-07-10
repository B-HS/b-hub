import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createDriveAssetRoute } from '../../../route/drive/asset'
import { createAppError } from '../../../lib/error'

const createMockDeps = () => ({
    driveAssetService: {
        upload: mock(() =>
            Promise.resolve({
                id: 1,
                s3Key: 'users/user-1/uuid/photo.jpg',
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                isPublic: false,
                url: 'https://cdn.example.com/users/user-1/uuid/photo.jpg',
            }),
        ),
        list: mock(() =>
            Promise.resolve({
                data: [
                    {
                        id: 1,
                        originalName: 'photo.jpg',
                        mimeType: 'image/jpeg',
                        sizeBytes: 1024,
                        isPublic: false,
                        thumbnail: 'data:image/webp;base64,dGh1bWI=',
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
                total: 1,
                page: 1,
                limit: 20,
            }),
        ),
        getDetail: mock(() =>
            Promise.resolve({
                id: 1,
                originalName: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 1024,
                isPublic: false,
                fileHash: 'abc123',
                url: 'https://presigned.example.com/file',
                thumbnail: null,
                lastViewedAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            }),
        ),
        update: mock(() => Promise.resolve({ id: 1, isPublic: true })),
        remove: mock(() => Promise.resolve({ id: 1 })),
        getQuota: mock(() => Promise.resolve({ used: 1000, total: 5368709120, remaining: 5368708120 })),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/drive', createDriveAssetRoute(deps))
    return { app, deps }
}

describe('POST /drive/assets', () => {
    test('파일을 업로드한다', async () => {
        const { app } = createApp()
        const formData = new FormData()
        formData.append('file', new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' }))

        const res = await app.request('/drive/assets', { method: 'POST', body: formData })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe(1)
        expect(body.data.originalName).toBe('photo.jpg')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)

        const formData = new FormData()
        formData.append('file', new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' }))

        const res = await app.request('/drive/assets', { method: 'POST', body: formData })
        expect(res.status).toBe(401)
    })

    test('파일 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const formData = new FormData()

        const res = await app.request('/drive/assets', { method: 'POST', body: formData })
        expect(res.status).not.toBe(200)
    })
})

describe('GET /drive/assets', () => {
    test('파일 목록을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/assets')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data).toHaveLength(1)
        expect(body.pagination.total).toBe(1)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)

        const res = await app.request('/drive/assets')
        expect(res.status).toBe(401)
    })
})

describe('GET /drive/assets/:assetId', () => {
    test('파일 상세를 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/assets/1')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe(1)
        expect(body.data.url).toBe('https://presigned.example.com/file')
    })

    test('존재하지 않는 파일은 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.driveAssetService.getDetail = mock(() => Promise.reject(createAppError('DRIVE_ASSET_NOT_FOUND')))
        const { app } = createApp(deps)

        const res = await app.request('/drive/assets/999')
        expect(res.status).toBe(404)
    })

    test('숫자가 아닌 assetId는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/assets/not-a-number')
        expect(res.status).toBe(400)
    })
})

describe('PATCH /drive/assets/:assetId', () => {
    test('공개 설정을 변경한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/assets/1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPublic: true }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.isPublic).toBe(true)
    })
})

describe('DELETE /drive/assets/:assetId', () => {
    test('파일을 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/assets/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe(1)
    })

    test('다른 유저의 파일 삭제 시 404를 반환한다', async () => {
        const deps = createMockDeps()
        deps.driveAssetService.remove = mock(() => Promise.reject(createAppError('DRIVE_ASSET_NOT_FOUND')))
        const { app } = createApp(deps)

        const res = await app.request('/drive/assets/1', { method: 'DELETE' })
        expect(res.status).toBe(404)
    })
})

describe('GET /drive/quota', () => {
    test('사용량을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/drive/quota')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.used).toBe(1000)
        expect(body.data.total).toBe(5368709120)
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)

        const res = await app.request('/drive/quota')
        expect(res.status).toBe(401)
    })
})
