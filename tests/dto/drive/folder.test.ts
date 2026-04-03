import { describe, expect, test } from 'bun:test'
import { driveFolderCreateSchema, driveFolderUpdateSchema, driveFolderListQuerySchema, driveFolderParamSchema } from '../../../dto/drive/folder'

describe('driveFolderCreateSchema', () => {
    test('유효한 값을 파싱한다', () => {
        const result = driveFolderCreateSchema.parse({ name: '사진' })
        expect(result.name).toBe('사진')
        expect(result.parentId).toBeUndefined()
    })

    test('parentId를 포함하여 파싱한다', () => {
        const result = driveFolderCreateSchema.parse({ name: '여행', parentId: 'folder-1' })
        expect(result.parentId).toBe('folder-1')
    })

    test('parentId가 null이면 루트 폴더다', () => {
        const result = driveFolderCreateSchema.parse({ name: '문서', parentId: null })
        expect(result.parentId).toBeNull()
    })

    test('name이 빈 문자열이면 거부한다', () => {
        expect(() => driveFolderCreateSchema.parse({ name: '' })).toThrow()
    })

    test('name이 255자를 초과하면 거부한다', () => {
        expect(() => driveFolderCreateSchema.parse({ name: 'a'.repeat(256) })).toThrow()
    })
})

describe('driveFolderUpdateSchema', () => {
    test('name만 변경할 수 있다', () => {
        const result = driveFolderUpdateSchema.parse({ name: '새이름' })
        expect(result.name).toBe('새이름')
        expect(result.parentId).toBeUndefined()
    })

    test('parentId만 변경할 수 있다', () => {
        const result = driveFolderUpdateSchema.parse({ parentId: 'folder-2' })
        expect(result.parentId).toBe('folder-2')
    })

    test('parentId를 null로 설정하면 루트로 이동한다', () => {
        const result = driveFolderUpdateSchema.parse({ parentId: null })
        expect(result.parentId).toBeNull()
    })

    test('빈 객체도 허용한다', () => {
        const result = driveFolderUpdateSchema.parse({})
        expect(result.name).toBeUndefined()
        expect(result.parentId).toBeUndefined()
    })
})

describe('driveFolderListQuerySchema', () => {
    test('parentId 없이 파싱한다', () => {
        const result = driveFolderListQuerySchema.parse({})
        expect(result.parentId).toBeUndefined()
    })

    test('parentId를 파싱한다', () => {
        const result = driveFolderListQuerySchema.parse({ parentId: 'folder-1' })
        expect(result.parentId).toBe('folder-1')
    })
})

describe('driveFolderParamSchema', () => {
    test('folderId를 파싱한다', () => {
        const result = driveFolderParamSchema.parse({ folderId: 'abc-123' })
        expect(result.folderId).toBe('abc-123')
    })
})
