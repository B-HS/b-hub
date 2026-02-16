import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createImageRoute } from '../../../route/blog/image'

const createMockDeps = () => ({
    blogImageService: {
        upload: mock(() =>
            Promise.resolve({
                id: 'img-1',
                url: 'https://cdn.example.com/blog/img-1.webp',
                mimeType: 'image/webp',
                sizeBytes: 50000,
                width: 800,
                height: 600,
            }),
        ),
        getList: mock(() =>
            Promise.resolve([
                {
                    imageId: 1,
                    fileName: 'test.webp',
                    originalName: 'photo.jpg',
                    url: 'https://cdn.example.com/test.webp',
                    mimeType: 'image/webp',
                    fileSize: 50000,
                    width: 800,
                    height: 600,
                    createdAt: new Date(),
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

describe('POST /blog/images/upload', () => {
    test('관리자가 이미지를 업로드한다', async () => {
        const { app } = createApp()
        const formData = new FormData()
        formData.append('file', new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' }))

        const res = await app.request('/blog/images/upload', {
            method: 'POST',
            body: formData,
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.id).toBe('img-1')
        expect(body.data.mimeType).toBe('image/webp')
    })

    test('파일 없으면 에러를 반환한다', async () => {
        const { app } = createApp()
        const formData = new FormData()

        const res = await app.request('/blog/images/upload', {
            method: 'POST',
            body: formData,
        })
        expect(res.status).not.toBe(200)
    })
})
