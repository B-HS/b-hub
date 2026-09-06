import { describe, expect, test } from 'bun:test'
import { driveAssetListQuerySchema, driveAssetParamSchema, driveAssetPrepareSchema, driveAssetUpdateSchema } from '../../../dto/drive/asset'

describe('driveAssetListQuerySchema', () => {
    test('기본값으로 파싱한다', () => {
        const result = driveAssetListQuerySchema.parse({})
        expect(result.page).toBe(1)
        expect(result.limit).toBe(20)
        expect(result.sort).toBe('created')
        expect(result.order).toBe('desc')
        expect(result.mimeType).toBeUndefined()
        expect(result.folderId).toBeUndefined()
    })

    test('folderId를 포함하여 파싱한다', () => {
        const result = driveAssetListQuerySchema.parse({ folderId: 'folder-1' })
        expect(result.folderId).toBe('folder-1')
    })

    test('folderId를 root로 설정하면 루트 파일만 조회한다', () => {
        const result = driveAssetListQuerySchema.parse({ folderId: 'root' })
        expect(result.folderId).toBe('root')
    })

    test('유효한 값을 파싱한다', () => {
        const result = driveAssetListQuerySchema.parse({
            page: '3',
            limit: '50',
            mimeType: 'image/',
            sort: 'name',
            order: 'asc',
        })
        expect(result.page).toBe(3)
        expect(result.limit).toBe(50)
        expect(result.mimeType).toBe('image/')
        expect(result.sort).toBe('name')
        expect(result.order).toBe('asc')
    })

    test('page는 양수여야 한다', () => {
        expect(() => driveAssetListQuerySchema.parse({ page: '0' })).toThrow()
        expect(() => driveAssetListQuerySchema.parse({ page: '-1' })).toThrow()
    })

    test('limit는 1~100 범위여야 한다', () => {
        expect(() => driveAssetListQuerySchema.parse({ limit: '0' })).toThrow()
        expect(() => driveAssetListQuerySchema.parse({ limit: '101' })).toThrow()
    })

    test('sort는 created, name, size만 허용한다', () => {
        expect(() => driveAssetListQuerySchema.parse({ sort: 'invalid' })).toThrow()
    })

    test('order는 asc, desc만 허용한다', () => {
        expect(() => driveAssetListQuerySchema.parse({ order: 'invalid' })).toThrow()
    })
})

describe('driveAssetParamSchema', () => {
    test('문자열 숫자를 정수로 변환한다', () => {
        const result = driveAssetParamSchema.parse({ assetId: '42' })
        expect(result.assetId).toBe(42)
    })

    test('양의 정수만 허용한다', () => {
        expect(() => driveAssetParamSchema.parse({ assetId: '0' })).toThrow()
        expect(() => driveAssetParamSchema.parse({ assetId: '-1' })).toThrow()
        expect(() => driveAssetParamSchema.parse({ assetId: '1.5' })).toThrow()
    })
})

describe('driveAssetUpdateSchema', () => {
    test('isPublic만 변경할 수 있다', () => {
        const result = driveAssetUpdateSchema.parse({ isPublic: true })
        expect(result.isPublic).toBe(true)
        expect(result.folderId).toBeUndefined()
    })

    test('folderId만 변경할 수 있다', () => {
        const result = driveAssetUpdateSchema.parse({ folderId: 'folder-1' })
        expect(result.folderId).toBe('folder-1')
    })

    test('folderId를 null로 설정하면 루트로 이동한다', () => {
        const result = driveAssetUpdateSchema.parse({ folderId: null })
        expect(result.folderId).toBeNull()
    })

    test('isPublic과 folderId를 동시에 변경할 수 있다', () => {
        const result = driveAssetUpdateSchema.parse({ isPublic: false, folderId: 'folder-2' })
        expect(result.isPublic).toBe(false)
        expect(result.folderId).toBe('folder-2')
    })

    test('빈 객체도 허용한다', () => {
        const result = driveAssetUpdateSchema.parse({})
        expect(result.isPublic).toBeUndefined()
        expect(result.folderId).toBeUndefined()
    })
})

describe('driveAssetPrepareSchema', () => {
    test('Storage 가 보내는 본문을 그대로 파싱한다', () => {
        const result = driveAssetPrepareSchema.parse({
            originalName: 'video.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 500_000,
            folderId: 'folder-1',
            fileHash: 'a'.repeat(64),
        })

        expect(result).toEqual({
            originalName: 'video.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 500_000,
            folderId: 'folder-1',
            fileHash: 'a'.repeat(64),
        })
    })

    test('folderId 와 fileHash 는 생략하면 기본값을 채운다', () => {
        const result = driveAssetPrepareSchema.parse({ originalName: 'a.txt', mimeType: 'text/plain', sizeBytes: 10 })

        expect(result.folderId).toBeNull()
        expect(result.fileHash).toBe('')
    })

    test('folderId 는 null 을 허용한다', () => {
        expect(driveAssetPrepareSchema.parse({ originalName: 'a.txt', mimeType: 'text/plain', sizeBytes: 10, folderId: null }).folderId).toBeNull()
    })

    test('sizeBytes 는 문자열로 와도 숫자로 강제 변환한다', () => {
        expect(driveAssetPrepareSchema.parse({ originalName: 'a.txt', mimeType: 'text/plain', sizeBytes: '2048' }).sizeBytes).toBe(2048)
    })

    test('sizeBytes 가 0·음수·소수·비숫자면 거부한다', () => {
        const base = { originalName: 'a.txt', mimeType: 'text/plain' }
        expect(() => driveAssetPrepareSchema.parse({ ...base, sizeBytes: 0 })).toThrow()
        expect(() => driveAssetPrepareSchema.parse({ ...base, sizeBytes: -1 })).toThrow()
        expect(() => driveAssetPrepareSchema.parse({ ...base, sizeBytes: 1.5 })).toThrow()
        expect(() => driveAssetPrepareSchema.parse({ ...base, sizeBytes: 'abc' })).toThrow()
        expect(() => driveAssetPrepareSchema.parse(base)).toThrow()
    })

    test('originalName 은 1..255 자여야 한다', () => {
        const base = { mimeType: 'text/plain', sizeBytes: 10 }
        expect(() => driveAssetPrepareSchema.parse({ ...base, originalName: '' })).toThrow()
        expect(() => driveAssetPrepareSchema.parse({ ...base, originalName: 'a'.repeat(256) })).toThrow()
        expect(driveAssetPrepareSchema.parse({ ...base, originalName: 'a'.repeat(255) }).originalName).toHaveLength(255)
    })

    test('mimeType 이 없거나 비어 있으면 거부한다', () => {
        const base = { originalName: 'a.txt', sizeBytes: 10 }
        expect(() => driveAssetPrepareSchema.parse({ ...base, mimeType: '' })).toThrow()
        expect(() => driveAssetPrepareSchema.parse(base)).toThrow()
    })
})
