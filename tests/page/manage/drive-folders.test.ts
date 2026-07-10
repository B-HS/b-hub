import { describe, expect, test, mock } from 'bun:test'
import { Hono } from 'hono'
import { createManageDriveFoldersRoute } from '../../../page/manage/pages/drive-folders'
import type { DriveFolderService } from '../../../service/domain/drive/drive-folder'
import { mockUser, sessionOf, stubDriveFolderService } from './helpers'

const sampleFolder = { id: 'f-1', userId: 'u1', parentId: null, name: '사진', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') }

const createApp = (overrides: Partial<DriveFolderService> = {}) => {
    const app = new Hono()
    app.route(
        '/manage/drive/folders',
        createManageDriveFoldersRoute({ getSession: sessionOf(mockUser), driveFolderService: stubDriveFolderService(overrides) }),
    )
    return app
}

describe('GET /manage/drive/folders', () => {
    test('폴더 목록을 보여주고 parentId로 list를 호출한다', async () => {
        const list = mock(() => Promise.resolve([sampleFolder]))
        const res = await createApp({ list: list as never }).request('/manage/drive/folders?parentId=root-1')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('사진')
        expect(list).toHaveBeenCalledWith('u1', 'root-1')
    })
})

describe('POST /manage/drive/folders', () => {
    test('create를 호출한다', async () => {
        const create = mock(() => Promise.resolve(sampleFolder))
        const res = await createApp({ create: create as never }).request('/manage/drive/folders', {
            method: 'POST',
            body: new URLSearchParams({ name: '새 폴더' }),
        })
        expect(res.status).toBe(303)
        expect(create).toHaveBeenCalledWith('u1', { name: '새 폴더', parentId: null })
    })

    test('이름이 없으면 검증 실패한다', async () => {
        const create = mock(() => Promise.resolve(sampleFolder))
        const res = await createApp({ create: create as never }).request('/manage/drive/folders', { method: 'POST', body: new URLSearchParams() })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toContain('flash=err')
        expect(create).not.toHaveBeenCalled()
    })
})
