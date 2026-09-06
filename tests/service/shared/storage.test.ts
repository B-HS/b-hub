import { describe, expect, test, mock, spyOn } from 'bun:test'
import * as sentry from '../../../lib/sentry'
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

    test('getUrl이 CDN 도메인과 키를 올바르게 조합한다', () => {
        const storage = createStorageService({
            s3: createMockS3() as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.example.com',
        })

        const url = storage.getUrl('uploads/photo.png')
        expect(url).toBe('https://cdn.example.com/uploads/photo.png')
        expect(url.startsWith('https://cdn.example.com/')).toBe(true)
        expect(url.endsWith('uploads/photo.png')).toBe(true)
    })

    test('getObjectStream이 R2 오브젝트의 웹 스트림을 반환한다', async () => {
        const stream = new ReadableStream()
        const mockS3 = { send: mock(() => Promise.resolve({ Body: { transformToWebStream: () => stream } })) }
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        expect(await storage.getObjectStream('users/user-1/uuid/photo.jpg')).toBe(stream)
    })

    test('getObjectStream이 Body 없으면 null을 반환한다', async () => {
        const mockS3 = { send: mock(() => Promise.resolve({})) }
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        expect(await storage.getObjectStream('missing')).toBeNull()
    })

    test('getObjectStream이 S3 에러를 null로 흡수한다', async () => {
        const mockS3 = { send: mock(() => Promise.reject(new Error('NoSuchKey'))) }
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        expect(await storage.getObjectStream('missing')).toBeNull()
    })

    test('del에서 S3 에러가 STORAGE_DELETE_FAILED로 변환된다', async () => {
        const mockS3 = { send: mock(() => Promise.reject(new Error('S3 error'))) }
        const storage = createStorageService({
            s3: mockS3 as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

        try {
            await storage.del('test.webp')
            expect.unreachable('에러가 발생해야 한다')
        } catch (error: unknown) {
            const appError = error as { code: string; statusCode: number }
            expect(appError.code).toBe('STORAGE_DELETE_FAILED')
            expect(appError.statusCode).toBe(500)
        }
    })
})

describe('createStorageService 실패 기록', () => {
    const S3_ERROR = new Error('S3 error')

    const createFailingStorage = () =>
        createStorageService({
            s3: { send: mock(() => Promise.reject(S3_ERROR)) } as never,
            bucket: 'test-bucket',
            cdnDomain: 'https://cdn.test.com',
        })

    test('del 실패를 captureException 으로 기록하고 STORAGE_DELETE_FAILED 를 던진다', async () => {
        const captureSpy = spyOn(sentry, 'captureException')

        await expect(createFailingStorage().del('test.webp')).rejects.toMatchObject({ code: 'STORAGE_DELETE_FAILED' })

        expect(captureSpy).toHaveBeenCalledWith(S3_ERROR)
        captureSpy.mockRestore()
    })

    test('upload 실패를 captureException 으로 기록하고 STORAGE_UPLOAD_FAILED 를 던진다', async () => {
        const captureSpy = spyOn(sentry, 'captureException')

        await expect(createFailingStorage().upload('test.webp', Buffer.from('data'), 'image/webp')).rejects.toMatchObject({
            code: 'STORAGE_UPLOAD_FAILED',
        })

        expect(captureSpy).toHaveBeenCalledWith(S3_ERROR)
        captureSpy.mockRestore()
    })

    test('getObjectStream 실패를 captureException 으로 기록하고 null 을 유지한다', async () => {
        const captureSpy = spyOn(sentry, 'captureException')

        expect(await createFailingStorage().getObjectStream('missing')).toBeNull()

        expect(captureSpy).toHaveBeenCalledWith(S3_ERROR)
        captureSpy.mockRestore()
    })

    test('getObject 실패를 captureException 으로 기록하고 null 을 유지한다', async () => {
        const captureSpy = spyOn(sentry, 'captureException')

        expect(await createFailingStorage().getObject('missing')).toBeNull()

        expect(captureSpy).toHaveBeenCalledWith(S3_ERROR)
        captureSpy.mockRestore()
    })
})
