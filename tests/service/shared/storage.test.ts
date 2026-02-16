import { describe, expect, test, mock } from 'bun:test'
import { createStorageService } from '../../../service/shared/storage'

const createMockS3 = () => ({
    send: mock(() => Promise.resolve({ Contents: [{ Key: 'file1.webp' }] })),
})

describe('createStorageService', () => {
    test('upload가 S3에 파일을 업로드한다', async () => {
        const mockS3 = createMockS3()
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        const result = await storage.upload('test.webp', Buffer.from('data'), 'image/webp')
        expect(result.key).toBe('test.webp')
        expect(result.url).toBe('https://cdn.test.com/test.webp')
        expect(mockS3.send).toHaveBeenCalledTimes(1)
    })

    test('del이 S3에서 파일을 삭제한다', async () => {
        const mockS3 = createMockS3()
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        await storage.del('test.webp')
        expect(mockS3.send).toHaveBeenCalledTimes(1)
    })

    test('list가 파일 목록을 반환한다', async () => {
        const mockS3 = createMockS3()
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        const result = await storage.list('blog/')
        expect(result).toEqual([{ Key: 'file1.webp' }])
    })

    test('list가 Contents가 없으면 빈 배열을 반환한다', async () => {
        const mockS3 = { send: mock(() => Promise.resolve({})) }
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        const result = await storage.list()
        expect(result).toEqual([])
    })

    test('getUrl이 CDN URL을 생성한다', () => {
        const storage = createStorageService({
            s3: createMockS3() as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        expect(storage.getUrl('blog/image.webp')).toBe('https://cdn.test.com/blog/image.webp')
    })
})
