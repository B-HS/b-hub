import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageDriveAssetsRoute } from '../../../page/manage/pages/drive-assets'
import type { DriveAssetService } from '../../../service/domain/drive/drive-asset'
import { mockUser, sessionOf, stubDriveAssetService } from './helpers'

const sampleAsset = {
    id: 7,
    originalName: 'photo.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    folderId: null,
    isPublic: false,
    storageTiers: 'L1',
    uploadStatus: 'ready',
    thumbnail: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
}

const createApp = (overrides: Partial<DriveAssetService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/drive/assets',
        createManageDriveAssetsRoute({ getSession: sessionOf(mockUser), driveAssetService: stubDriveAssetService(overrides) }),
    )
    return app
}

describe('GET /manage/drive/assets', () => {
    test('자산 목록과 쿼터를 보여준다', async () => {
        const res = await createApp({
            list: () => Promise.resolve({ data: [sampleAsset], total: 1, page: 1, limit: 20 }) as never,
            getQuota: () => Promise.resolve({ used: 2048, total: 1000000, remaining: 997952 }),
        }).request('/manage/drive/assets')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('photo.png')
        expect(html).toContain('/manage/drive/assets/7')
    })
})

describe('POST /manage/drive/assets/:id/update', () => {
    test('공개 토글은 isPublic만 업데이트한다', async () => {
        const update = mock(() => Promise.resolve({ id: 7 }))
        const res = await createApp({ update: update as never }).request('/manage/drive/assets/7/update', {
            method: 'POST',
            body: new URLSearchParams({ isPublic: 'true' }),
        })
        expect(res.status).toBe(303)
        expect(update).toHaveBeenCalledTimes(1)
        const [id, userId, data] = update.mock.calls[0] as unknown as [
            number,
            string,
            { isPublic?: boolean; folderId?: unknown; originalName?: unknown },
        ]
        expect(id).toBe(7)
        expect(userId).toBe('u1')
        expect(data.isPublic).toBe(true)
        expect(data.folderId).toBeUndefined()
        expect(data.originalName).toBeUndefined()
    })
})

describe('POST /manage/drive/assets/:id/delete', () => {
    test('remove를 호출한다', async () => {
        const remove = mock(() => Promise.resolve({ id: 7 }))
        const res = await createApp({ remove: remove as never }).request('/manage/drive/assets/7/delete', {
            method: 'POST',
            body: new URLSearchParams(),
        })
        expect(res.status).toBe(303)
        expect(remove).toHaveBeenCalledWith(7, 'u1')
    })
})

describe('GET /manage/drive/assets 페이지 파라미터 보정', () => {
    test('page=0 / -3 / abc 는 500 없이 1페이지로 조회한다', async () => {
        for (const value of ['0', '-3', 'abc']) {
            const list = mock(() => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }))
            const res = await createApp({ list: list as never }).request(`/manage/drive/assets?page=${value}`)
            expect(res.status).toBe(200)
            expect((list.mock.calls[0] as unknown as [string, { page: number }])[1].page).toBe(1)
        }
    })
})
