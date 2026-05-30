import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createDriveRoute } from '../../../page/admin/pages/drive'
import { mockAdmin, sessionOf, stubAdminDb } from './helpers'

const sampleAsset = {
    id: 7,
    userId: 'u-1',
    userEmail: 'owner@example.com',
    originalName: 'vacation-photo.png',
    mimeType: 'image/png',
    sizeBytes: 12345,
    storageTiers: 'L1',
    uploadStatus: 'ready',
    accessCount: 3,
    lastViewedAt: new Date('2026-05-04'),
    createdAt: new Date('2026-05-01'),
}

const sampleFolder = {
    id: 'folder-abcdef0123',
    userId: 'u-1',
    userEmail: 'owner@example.com',
    parentId: null,
    name: '여행 사진',
    createdAt: new Date('2026-05-01'),
}

const sampleLog = {
    id: 1,
    assetId: 7,
    action: 'promote',
    fromTier: 'L2',
    toTier: 'L1',
    reason: 'frequent access',
    createdAt: new Date('2026-05-05'),
}

const createApp = (overrides: Parameters<typeof stubAdminDb>[0] = {}) => {
    const app = new Hono()
    app.route(
        '/admin/drive',
        createDriveRoute({
            getSession: sessionOf(mockAdmin),
            adminDb: stubAdminDb({
                listDriveAssets: () => Promise.resolve({ rows: [sampleAsset], total: 1 }),
                listDriveFolders: () => Promise.resolve({ rows: [sampleFolder], total: 1 }),
                listLifecycleLogs: () => Promise.resolve({ rows: [sampleLog], total: 1 }),
                ...overrides,
            }),
        }),
    )
    return app
}

describe('GET /admin/drive/assets (list)', () => {
    test('200과 original name을 보여준다', async () => {
        const res = await createApp().request('/admin/drive/assets')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('vacation-photo.png')
        expect(html).toContain('owner@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('q/userId/tier/status 필터가 prefill 된다', async () => {
        const res = await createApp().request('/admin/drive/assets?q=photo&userId=u-1&tier=L1&status=ready')
        const html = await res.text()
        expect(html).toContain('value="photo"')
        expect(html).toContain('value="u-1"')
        expect(html).toContain('<option value="L1" selected="">L1</option>')
        expect(html).toContain('<option value="ready" selected="">ready</option>')
    })

    test('size는 5~100 범위로 clamp 된다 (초과 시 100)', async () => {
        const listDriveAssets = mock(() => Promise.resolve({ rows: [sampleAsset], total: 1 }))
        const app = createApp({ listDriveAssets })
        await app.request('/admin/drive/assets?size=9999')
        expect(listDriveAssets).toHaveBeenCalled()
        expect((listDriveAssets.mock.calls[0][0] as { size: number }).size).toBe(100)
    })

    test('size는 5 미만일 때 5로 clamp 된다', async () => {
        const listDriveAssets = mock(() => Promise.resolve({ rows: [sampleAsset], total: 1 }))
        const app = createApp({ listDriveAssets })
        await app.request('/admin/drive/assets?size=1')
        expect((listDriveAssets.mock.calls[0][0] as { size: number }).size).toBe(5)
    })

    test('잘못된 page 값은 1로 폴백되고 크래시하지 않는다', async () => {
        const listDriveAssets = mock(() => Promise.resolve({ rows: [sampleAsset], total: 1 }))
        const app = createApp({ listDriveAssets })
        const res = await app.request('/admin/drive/assets?page=abc')
        expect(res.status).toBe(200)
        expect((listDriveAssets.mock.calls[0][0] as { page: number }).page).toBe(1)
    })
})

describe('POST /admin/drive/assets/:id/delete', () => {
    test('deleteDriveAsset가 int로 호출되고 flash=ok로 리다이렉트한다', async () => {
        const deleteDriveAsset = mock(() => Promise.resolve())
        const app = createApp({ deleteDriveAsset })
        const res = await app.request('/admin/drive/assets/7/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/drive/assets?flash=ok')
        expect(deleteDriveAsset).toHaveBeenCalledWith(7)
    })

    test('id가 0이면 deleteDriveAsset를 호출하지 않지만 303 리다이렉트한다', async () => {
        const deleteDriveAsset = mock(() => Promise.resolve())
        const app = createApp({ deleteDriveAsset })
        const res = await app.request('/admin/drive/assets/0/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('/admin/drive/assets?flash=ok')
        expect(deleteDriveAsset).not.toHaveBeenCalled()
    })

    test('id가 숫자가 아니면 deleteDriveAsset를 호출하지 않는다', async () => {
        const deleteDriveAsset = mock(() => Promise.resolve())
        const app = createApp({ deleteDriveAsset })
        const res = await app.request('/admin/drive/assets/abc/delete', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(deleteDriveAsset).not.toHaveBeenCalled()
    })

    test('returnTo=https://evil.com 은 리다이렉트 Location에 나타나지 않는다', async () => {
        const app = createApp()
        const res = await app.request('/admin/drive/assets/7/delete', {
            method: 'POST',
            body: new URLSearchParams({ returnTo: 'https://evil.com' }),
        })
        expect(res.status).toBe(303)
        const location = res.headers.get('location') ?? ''
        expect(location).not.toContain('evil.com')
        expect(location).toBe('/admin/drive/assets?flash=ok')
    })
})

describe('GET /admin/drive/folders (list)', () => {
    test('200과 폴더 이름을 보여준다', async () => {
        const res = await createApp().request('/admin/drive/folders')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('여행 사진')
        expect(html).toContain('owner@example.com')
        expect(html).toContain('1–1 / 1')
    })

    test('size는 5~200 범위로 clamp 된다 (초과 시 200)', async () => {
        const listDriveFolders = mock(() => Promise.resolve({ rows: [sampleFolder], total: 1 }))
        const app = createApp({ listDriveFolders })
        await app.request('/admin/drive/folders?size=9999')
        expect((listDriveFolders.mock.calls[0][0] as { size: number }).size).toBe(200)
    })
})

describe('GET /admin/drive/lifecycle-logs (list)', () => {
    test('200과 로그 action을 보여준다', async () => {
        const res = await createApp().request('/admin/drive/lifecycle-logs')
        expect(res.status).toBe(200)
        const html = await res.text()
        expect(html).toContain('promote')
        expect(html).toContain('L2 → L1')
        expect(html).toContain('1–1 / 1')
    })

    test('assetId 필터가 prefill 되고 숫자로 전달된다', async () => {
        const listLifecycleLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createApp({ listLifecycleLogs })
        const res = await app.request('/admin/drive/lifecycle-logs?assetId=7')
        const html = await res.text()
        expect(html).toContain('value="7"')
        expect((listLifecycleLogs.mock.calls[0][0] as { assetId?: number }).assetId).toBe(7)
    })

    test('잘못된 assetId는 undefined로 전달된다', async () => {
        const listLifecycleLogs = mock(() => Promise.resolve({ rows: [sampleLog], total: 1 }))
        const app = createApp({ listLifecycleLogs })
        await app.request('/admin/drive/lifecycle-logs?assetId=abc')
        expect((listLifecycleLogs.mock.calls[0][0] as { assetId?: number }).assetId).toBeUndefined()
    })
})
