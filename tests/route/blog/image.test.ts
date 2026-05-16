import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createImageRoute } from '../../../route/blog/image'

const createMockDeps = () => ({
    blogImageService: {
        prepare: mock(() => ({
            assetId: 'asset-uuid',
            s3Key: 'blog/asset-uuid.webp',
            uploadToken: 'token.abc.def',
            uploadUrl: 'https://upload.example.com/upload-blog-image',
            expiresAt: Date.now() + 60000,
        })),
        complete: mock(() =>
            Promise.resolve({
                id: 'asset-uuid',
                url: 'https://cdn.example.com/blog/asset-uuid.webp',
                mimeType: 'image/webp',
                sizeBytes: 50000,
                width: 800,
                height: 600,
            }),
        ),
        delete: mock(() => Promise.resolve()),
        getList: mock(() =>
            Promise.resolve([
                {
                    id: 'asset-uuid',
                    r2Key: 'blog/asset-uuid.webp',
                    url: 'https://cdn.example.com/blog/asset-uuid.webp',
                    mimeType: 'image/webp',
                    sizeBytes: 50000,
                    width: 800,
                    height: 600,
                    createdAt: new Date().toISOString(),
                },
            ]),
        ),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'admin' } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/blog/images', createImageRoute(deps))
    return { app, deps }
}

describe('GET /blog/images', () => {
    test('관리자가 이미지 목록을 조회한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/images')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.images).toHaveLength(1)
        expect(body.data.images[0].id).toBe('asset-uuid')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images')
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images')
        expect(res.status).toBe(403)
    })
})

describe('POST /blog/images/prepare', () => {
    test('관리자가 prepare를 호출하면 uploadToken과 s3Key를 받는다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/blog/images/prepare', { method: 'POST' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.assetId).toBe('asset-uuid')
        expect(body.data.s3Key).toBe('blog/asset-uuid.webp')
        expect(body.data.uploadUrl).toBe('https://upload.example.com/upload-blog-image')
        expect(deps.blogImageService.prepare).toHaveBeenCalledWith('user-1')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images/prepare', { method: 'POST' })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images/prepare', { method: 'POST' })
        expect(res.status).toBe(403)
    })
})

describe('POST /blog/images/complete', () => {
    test('upload-server 콜백을 처리하고 메타데이터를 반환한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/blog/images/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assetId: '550e8400-e29b-41d4-a716-446655440000',
                s3Key: 'blog/550e8400-e29b-41d4-a716-446655440000.webp',
                uploadToken: 'token.abc.def',
                sizeBytes: 50000,
                width: 800,
                height: 600,
            }),
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.url).toBe('https://cdn.example.com/blog/asset-uuid.webp')
        expect(deps.blogImageService.complete).toHaveBeenCalled()
    })

    test('필수 필드 누락 시 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/blog/images/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId: 'a' }),
        })
        expect(res.status).not.toBe(200)
    })
})

describe('DELETE /blog/images/:id', () => {
    test('관리자가 이미지를 삭제한다', async () => {
        const { app, deps } = createApp()
        const res = await app.request('/blog/images/asset-uuid', { method: 'DELETE' })
        expect(res.status).toBe(200)
        expect(deps.blogImageService.delete).toHaveBeenCalledWith('asset-uuid')
    })

    test('인증 없으면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve(null))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images/asset-uuid', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })

    test('관리자가 아니면 403을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } }))
        const { app } = createApp(deps)
        const res = await app.request('/blog/images/asset-uuid', { method: 'DELETE' })
        expect(res.status).toBe(403)
    })
})
