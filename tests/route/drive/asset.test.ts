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

describe('POST /drive/assets/prepare', () => {
    const createPrepareApp = () => {
        const deps = {
            driveAssetService: {
                prepare: mock(() =>
                    Promise.resolve({ assetId: 1, s3Key: 'users/user-1/uuid/video.mp4', uploadToken: 'tok', uploadStatus: 'preparing' }),
                ),
            },
            getSession: mock(() => Promise.resolve({ user: { id: 'user-1', role: 'user' } })),
        }
        const app = new Hono()
        app.route('/drive', createDriveAssetRoute(deps as never))
        return { app, deps }
    }

    const prepareRequest = (app: Hono, body: unknown) =>
        app.request('/drive/assets/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

    test('검증을 통과하면 prepare 응답을 그대로 반환한다', async () => {
        const { app, deps } = createPrepareApp()
        const res = await prepareRequest(app, {
            originalName: 'video.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 500_000,
            folderId: null,
            fileHash: 'abc123',
        })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            success: true,
            data: { assetId: 1, s3Key: 'users/user-1/uuid/video.mp4', uploadToken: 'tok', uploadStatus: 'preparing' },
        })
        expect(deps.driveAssetService.prepare).toHaveBeenCalledWith('user-1', {
            originalName: 'video.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 500_000,
            folderId: null,
            fileHash: 'abc123',
        })
    })

    test('sizeBytes 가 없으면 400 을 반환하고 서비스를 호출하지 않는다', async () => {
        const { app, deps } = createPrepareApp()
        const res = await prepareRequest(app, { originalName: 'video.mp4', mimeType: 'video/mp4' })

        expect(res.status).toBe(400)
        expect((await res.json()).success).toBe(false)
        expect(deps.driveAssetService.prepare).not.toHaveBeenCalled()
    })

    test('sizeBytes 가 음수면 400 을 반환한다', async () => {
        const { app, deps } = createPrepareApp()
        const res = await prepareRequest(app, { originalName: 'video.mp4', mimeType: 'video/mp4', sizeBytes: -1 })

        expect(res.status).toBe(400)
        expect(deps.driveAssetService.prepare).not.toHaveBeenCalled()
    })

    test('originalName 이 비어 있으면 400 을 반환한다', async () => {
        const { app, deps } = createPrepareApp()
        const res = await prepareRequest(app, { originalName: '', mimeType: 'video/mp4', sizeBytes: 10 })

        expect(res.status).toBe(400)
        expect(deps.driveAssetService.prepare).not.toHaveBeenCalled()
    })
})

const UPLOAD_SERVER_SECRET = 'upload-server-secret'

const createCallbackApp = (uploadServerSecret = UPLOAD_SERVER_SECRET) => {
    const deps = {
        driveAssetService: {
            updateUploadStatus: mock(() => Promise.resolve({ id: 1, uploadStatus: 'uploading', s3Key: 'users/user-1/uuid/photo.jpg' })),
            complete: mock(() => Promise.resolve({ id: 1, uploadStatus: 'ready' })),
            getAssetForTokenExchange: mock(() => Promise.resolve({ id: 1, userId: 'user-1' })),
        },
        getSession: mock(() => Promise.resolve(null)),
        getGdriveAccessToken: mock(() => Promise.resolve('gdrive-access-token')),
        gdriveRootFolderId: 'root-folder-id',
        uploadServerSecret,
    }
    const app = new Hono()
    app.route('/drive', createDriveAssetRoute(deps))
    return { app, deps }
}

const callbackRequest = (app: Hono, path: string, headers: Record<string, string>, body: Record<string, unknown>) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('upload-server 콜백 인증', () => {
    test('POST /drive/assets/1/status 는 Bearer 시크릿이 맞으면 200을 반환한다', async () => {
        const { app, deps } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/status',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token', status: 'uploading' },
        )

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, data: { id: 1, uploadStatus: 'uploading', s3Key: 'users/user-1/uuid/photo.jpg' } })
        expect(deps.driveAssetService.updateUploadStatus).toHaveBeenCalledWith(1, 'token', 'uploading')
    })

    test('POST /drive/assets/1/status 는 클라이언트가 보낸 s3Key 가 아니라 서버가 저장한 s3Key 를 돌려준다', async () => {
        const { app } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/status',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token', status: 'uploading', s3Key: 'users/attacker/uuid/evil.sh' },
        )

        expect(res.status).toBe(200)
        expect((await res.json()).data.s3Key).toBe('users/user-1/uuid/photo.jpg')
    })

    test('POST /drive/assets/1/status 는 x-upload-server-secret 헤더도 허용한다', async () => {
        const { app } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/status',
            { 'x-upload-server-secret': UPLOAD_SERVER_SECRET },
            { uploadToken: 'token', status: 'uploading' },
        )

        expect(res.status).toBe(200)
    })

    test('POST /drive/assets/1/status 는 헤더가 없으면 401을 반환한다', async () => {
        const { app, deps } = createCallbackApp()
        const res = await callbackRequest(app, '/drive/assets/1/status', {}, { uploadToken: 'token', status: 'uploading' })

        expect(res.status).toBe(401)
        expect((await res.json()).error.code).toBe('UNAUTHORIZED')
        expect(deps.driveAssetService.updateUploadStatus).not.toHaveBeenCalled()
    })

    test('POST /drive/assets/1/status 는 시크릿이 틀리면 401을 반환한다', async () => {
        const { app } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/status',
            { Authorization: 'Bearer upload-server-secreT' },
            { uploadToken: 'token', status: 'uploading' },
        )

        expect(res.status).toBe(401)
    })

    test('POST /drive/assets/1/complete 는 Bearer 시크릿이 맞으면 200을 반환한다', async () => {
        const { app, deps } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/complete',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token', fileHash: 'abc', storageTiers: 'L1,L3', gdriveFileId: 'gd-1' },
        )

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ success: true, data: { id: 1, uploadStatus: 'ready' } })
        expect(deps.driveAssetService.complete).toHaveBeenCalled()
    })

    test('POST /drive/assets/1/complete 는 upload-server 가 보낸 실제 sizeBytes 를 서비스에 전달한다', async () => {
        const { app, deps } = createCallbackApp()
        await callbackRequest(
            app,
            '/drive/assets/1/complete',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token', fileHash: 'abc', storageTiers: 'L1', gdriveFileId: null, sizeBytes: 4096 },
        )

        expect(deps.driveAssetService.complete).toHaveBeenCalledWith(1, 'token', expect.objectContaining({ sizeBytes: 4096 }))
    })

    test('POST /drive/assets/1/complete 는 sizeBytes 가 없으면 null 로 전달한다', async () => {
        const { app, deps } = createCallbackApp()
        await callbackRequest(
            app,
            '/drive/assets/1/complete',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token', fileHash: 'abc', storageTiers: 'L1' },
        )

        expect(deps.driveAssetService.complete).toHaveBeenCalledWith(1, 'token', expect.objectContaining({ sizeBytes: null }))
    })

    test('POST /drive/assets/1/complete 는 헤더가 없으면 401을 반환하고 서비스를 호출하지 않는다', async () => {
        const { app, deps } = createCallbackApp()
        const res = await callbackRequest(app, '/drive/assets/1/complete', {}, { uploadToken: 'token', storageTiers: 'L1' })

        expect(res.status).toBe(401)
        expect(deps.driveAssetService.complete).not.toHaveBeenCalled()
    })

    test('POST /drive/assets/1/gdrive-token 은 Bearer 시크릿이 맞으면 200을 반환한다', async () => {
        const { app } = createCallbackApp()
        const res = await callbackRequest(
            app,
            '/drive/assets/1/gdrive-token',
            { Authorization: `Bearer ${UPLOAD_SERVER_SECRET}` },
            { uploadToken: 'token' },
        )

        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual({ accessToken: 'gdrive-access-token', rootFolderId: 'root-folder-id' })
    })

    test('POST /drive/assets/1/gdrive-token 은 헤더가 없으면 401을 반환한다', async () => {
        const { app } = createCallbackApp()
        const res = await callbackRequest(app, '/drive/assets/1/gdrive-token', {}, { uploadToken: 'token' })

        expect(res.status).toBe(401)
    })

    test('시크릿이 미설정이면 세 콜백 모두 503을 반환한다', async () => {
        const { app, deps } = createCallbackApp('')

        const statusRes = await callbackRequest(
            app,
            '/drive/assets/1/status',
            { Authorization: 'Bearer anything' },
            { uploadToken: 'token', status: 'uploading' },
        )
        const completeRes = await callbackRequest(
            app,
            '/drive/assets/1/complete',
            { Authorization: 'Bearer anything' },
            { uploadToken: 'token', storageTiers: 'L1' },
        )
        const tokenRes = await callbackRequest(app, '/drive/assets/1/gdrive-token', { Authorization: 'Bearer anything' }, { uploadToken: 'token' })

        expect(statusRes.status).toBe(503)
        expect(completeRes.status).toBe(503)
        expect(tokenRes.status).toBe(503)
        expect((await tokenRes.json()).error.code).toBe('SERVICE_NOT_CONFIGURED')
        expect(deps.driveAssetService.updateUploadStatus).not.toHaveBeenCalled()
        expect(deps.driveAssetService.complete).not.toHaveBeenCalled()
        expect(deps.driveAssetService.getAssetForTokenExchange).not.toHaveBeenCalled()
    })
})
