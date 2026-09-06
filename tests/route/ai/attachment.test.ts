import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createAiAttachmentRoute } from '../../../route/ai/attachment'

const uploadResult = { id: 7, url: 'https://cdn.example.com/a.png', filename: 'a.png', mimeType: 'image/png', sizeBytes: 4 }

const createMockDeps = () => ({
    aiAttachmentService: {
        upload: mock(async () => uploadResult),
        remove: mock(async () => {}),
    },
    getSession: mock(async () => ({ user: { id: 'u1', role: null as string | null } })),
})

const createApp = (deps = createMockDeps()) => {
    const app = new Hono()
    app.route('/attachments', createAiAttachmentRoute(deps as unknown as Parameters<typeof createAiAttachmentRoute>[0]))
    return { app, deps }
}

const multipartBody = (bytes: Uint8Array, boundary: string) => {
    const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
        'utf8',
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
    return Buffer.concat([head, Buffer.from(bytes), tail])
}

const OVER_LIMIT_BYTES = 22 * 1024 * 1024

describe('POST /attachments 바디 크기 제한', () => {
    test('한도 이내 업로드는 서비스로 전달되어 200 봉투를 반환한다', async () => {
        const { app, deps } = createApp()
        const boundary = 'boundary-ok'
        const body = multipartBody(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), boundary)

        const res = await app.request('/attachments', {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body,
        })

        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data.id).toBe(7)
        expect(deps.aiAttachmentService.upload).toHaveBeenCalled()
    })

    test('한도를 초과하면 413 AI_ATTACHMENT_TOO_LARGE 봉투를 반환하고 서비스를 호출하지 않는다', async () => {
        const { app, deps } = createApp()
        const boundary = 'boundary-big'
        const body = multipartBody(new Uint8Array(OVER_LIMIT_BYTES), boundary)

        const res = await app.request('/attachments', {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(body.length) },
            body,
        })

        expect(res.status).toBe(413)
        const json = await res.json()
        expect(json.success).toBe(false)
        expect(json.error.code).toBe('AI_ATTACHMENT_TOO_LARGE')
        expect(typeof json.error.message).toBe('string')
        expect(deps.aiAttachmentService.upload).not.toHaveBeenCalled()
    })

    test('file 필드가 없으면 VALIDATION_ERROR 봉투를 반환한다', async () => {
        const { app } = createApp()
        const res = await app.request('/attachments', { method: 'POST', body: new FormData() })

        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    test('미인증이면 401을 반환한다', async () => {
        const deps = createMockDeps()
        deps.getSession = mock(async () => null as never)
        const { app } = createApp(deps)
        const res = await app.request('/attachments', { method: 'POST', body: new FormData() })

        expect(res.status).toBe(401)
    })
})
