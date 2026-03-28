import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createMailUploadRoute } from '../../../route/mail/upload'

const createMockDeps = (overrides: Record<string, unknown> = {}) => ({
    mailUploadService: {
        upload: mock(() => Promise.resolve({ id: 1, url: 'https://cdn.gumyo.net/file.png', filename: 'file.png' })),
        deleteUpload: mock(() => Promise.resolve()),
    },
    getSession: mock(() => Promise.resolve({ user: { id: 'user-1' } })),
    ...overrides,
})

const createApp = (overrides: Record<string, unknown> = {}) => {
    const app = new Hono()
    const deps = createMockDeps(overrides)
    const route = createMailUploadRoute(deps as Parameters<typeof createMailUploadRoute>[0])
    app.route('/uploads', route)
    return { app, deps }
}

describe('POST /uploads', () => {
    test('파일 업로드에 성공한다', async () => {
        const { app } = createApp()
        const formData = new FormData()
        formData.append('file', new File(['content'], 'test.png', { type: 'image/png' }))

        const res = await app.request('/uploads', { method: 'POST', body: formData })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { success: boolean }
        expect(body.success).toBe(true)
    })

    test('inline=true 플래그를 전달한다', async () => {
        const { app, deps } = createApp()
        const formData = new FormData()
        formData.append('file', new File(['content'], 'test.png', { type: 'image/png' }))
        formData.append('inline', 'true')

        await app.request('/uploads', { method: 'POST', body: formData })
        expect(deps.mailUploadService.upload).toHaveBeenCalledWith(expect.any(File), 'user-1', true)
    })

    test('인증되지 않으면 401을 반환한다', async () => {
        const { app } = createApp({
            getSession: mock(() => Promise.resolve(null)),
        })
        const formData = new FormData()
        formData.append('file', new File(['content'], 'test.png'))

        const res = await app.request('/uploads', { method: 'POST', body: formData })
        expect(res.status).toBe(401)
    })

    test('파일이 없으면 400을 반환한다', async () => {
        const { app } = createApp()
        const formData = new FormData()

        const res = await app.request('/uploads', { method: 'POST', body: formData })
        expect(res.status).toBe(400)
    })
})

describe('DELETE /uploads/:uploadId', () => {
    test('업로드를 삭제한다', async () => {
        const { app } = createApp()
        const res = await app.request('/uploads/1', { method: 'DELETE' })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { data: { deleted: boolean } }
        expect(body.data.deleted).toBe(true)
    })

    test('인증되지 않으면 401을 반환한다', async () => {
        const { app } = createApp({
            getSession: mock(() => Promise.resolve(null)),
        })
        const res = await app.request('/uploads/1', { method: 'DELETE' })
        expect(res.status).toBe(401)
    })

    test('유효하지 않은 uploadId는 400을 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/uploads/abc', { method: 'DELETE' })
        expect(res.status).toBe(400)
    })
})
