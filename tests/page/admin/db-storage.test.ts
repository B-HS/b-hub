import { describe, expect, test } from 'bun:test'
import { createAdminDb, type AdminStorage } from '../../../page/admin/db'
import type { Database } from '../../../db'

type FakeRow = Record<string, unknown>

const createFakeDb = (row: FakeRow | null, calls: string[]) => {
    const fake = {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => {
                        calls.push('select')
                        return Promise.resolve(row ? [row] : [])
                    },
                }),
            }),
        }),
        delete: () => ({
            where: () => {
                calls.push('delete')
                return Promise.resolve()
            },
        }),
    }
    return fake as unknown as Database
}

const createFakeStorage = (calls: string[], failing = false): AdminStorage => ({
    deleteObject: (key: string) => {
        calls.push(`storage:${key}`)
        return failing ? Promise.reject(new Error('R2 down')) : Promise.resolve()
    },
    deleteGdriveObject: (fileId: string) => {
        calls.push(`gdrive:${fileId}`)
        return Promise.resolve()
    },
})

describe('adminDb.deleteImageAsset', () => {
    test('R2 오브젝트를 먼저 지우고 행을 삭제한다', async () => {
        const calls: string[] = []
        const adminDb = createAdminDb(createFakeDb({ r2Key: 'blog/a.png' }, calls), createFakeStorage(calls))
        await adminDb.deleteImageAsset('img-1')
        expect(calls).toEqual(['select', 'storage:blog/a.png', 'delete'])
    })

    test('스토리지 삭제가 실패해도 행 삭제는 계속한다', async () => {
        const calls: string[] = []
        const adminDb = createAdminDb(createFakeDb({ r2Key: 'blog/a.png' }, calls), createFakeStorage(calls, true))
        await adminDb.deleteImageAsset('img-1')
        expect(calls).toEqual(['select', 'storage:blog/a.png', 'delete'])
    })

    test('스토리지 미주입이면 행만 삭제한다', async () => {
        const calls: string[] = []
        const adminDb = createAdminDb(createFakeDb({ r2Key: 'blog/a.png' }, calls))
        await adminDb.deleteImageAsset('img-1')
        expect(calls).toEqual(['select', 'delete'])
    })
})

describe('adminDb.deleteMailUpload', () => {
    test('업로드 오브젝트를 먼저 지우고 행을 삭제한다', async () => {
        const calls: string[] = []
        const adminDb = createAdminDb(createFakeDb({ r2Key: 'mail/u.pdf' }, calls), createFakeStorage(calls))
        await adminDb.deleteMailUpload(3)
        expect(calls).toEqual(['select', 'storage:mail/u.pdf', 'delete'])
    })

    test('행이 없으면 스토리지를 건드리지 않는다', async () => {
        const calls: string[] = []
        const adminDb = createAdminDb(createFakeDb(null, calls), createFakeStorage(calls))
        await adminDb.deleteMailUpload(3)
        expect(calls).toEqual(['select', 'delete'])
    })
})

describe('adminDb.deleteDriveAsset', () => {
    test('L1·L3 티어 오브젝트를 모두 지운 뒤 행을 삭제한다', async () => {
        const calls: string[] = []
        const row = { s3Key: 'drive/f.bin', storageTiers: 'L1,L3', gdriveFileId: 'gd-1' }
        const adminDb = createAdminDb(createFakeDb(row, calls), createFakeStorage(calls))
        await adminDb.deleteDriveAsset(7)
        expect(calls).toEqual(['select', 'storage:drive/f.bin', 'gdrive:gd-1', 'delete', 'delete'])
    })

    test('L1 티어만 있으면 gdrive 는 호출하지 않는다', async () => {
        const calls: string[] = []
        const row = { s3Key: 'drive/f.bin', storageTiers: 'L1', gdriveFileId: null }
        const adminDb = createAdminDb(createFakeDb(row, calls), createFakeStorage(calls))
        await adminDb.deleteDriveAsset(7)
        expect(calls).toEqual(['select', 'storage:drive/f.bin', 'delete', 'delete'])
    })

    test('L2 전용 자산은 스토리지 삭제 없이 행만 삭제한다', async () => {
        const calls: string[] = []
        const row = { s3Key: 'drive/f.bin', storageTiers: 'L2', gdriveFileId: null }
        const adminDb = createAdminDb(createFakeDb(row, calls), createFakeStorage(calls))
        await adminDb.deleteDriveAsset(7)
        expect(calls).toEqual(['select', 'delete', 'delete'])
    })
})
