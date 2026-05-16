import { describe, expect, test, mock } from 'bun:test'
import { createBlogImageService } from '../../../../service/domain/blog/blog-image'

const TOKEN_SECRET = 'test-secret'

const createMockDeps = () => ({
    storage: {
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
        delete: mock(() => Promise.resolve()),
    },
    db: {
        insertImageAsset: mock(() => Promise.resolve()),
        getImageList: mock(() =>
            Promise.resolve([
                {
                    id: 'test-uuid-123',
                    r2Key: 'blog/test-uuid-123.webp',
                    url: 'https://cdn.example.com/blog/test-uuid-123.webp',
                    mimeType: 'image/webp',
                    sizeBytes: 50000,
                    width: 800,
                    height: 600,
                    createdAt: new Date().toISOString(),
                },
            ]),
        ),
        getImageAssetById: mock((id: string) => Promise.resolve({ r2Key: `blog/${id}.webp` })),
        deleteImageAsset: mock(() => Promise.resolve()),
    },
    bucket: 'test-bucket',
    generateId: () => 'test-uuid-123',
    tokenSecret: TOKEN_SECRET,
    uploadServerUrl: 'https://upload.example.com/upload-blog-image',
})

describe('createBlogImageService.prepare', () => {
    test('assetId, s3Key, uploadToken, uploadUrl을 반환한다', () => {
        const service = createBlogImageService(createMockDeps())
        const result = service.prepare('user-1')
        expect(result.assetId).toBe('test-uuid-123')
        expect(result.s3Key).toBe('blog/test-uuid-123.webp')
        expect(result.uploadUrl).toBe('https://upload.example.com/upload-blog-image')
        expect(result.uploadToken.split('.').length).toBe(3)
        expect(result.expiresAt).toBeGreaterThan(Date.now())
    })
})

describe('createBlogImageService.complete', () => {
    test('유효한 토큰으로 호출 시 image_assets에 insert하고 결과를 반환한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const { assetId, s3Key, uploadToken } = service.prepare('user-1')
        const result = await service.complete({
            assetId,
            s3Key,
            uploadToken,
            sizeBytes: 12345,
            width: 800,
            height: 600,
        })

        expect(result.id).toBe('test-uuid-123')
        expect(result.url).toBe('https://cdn.example.com/blog/test-uuid-123.webp')
        expect(result.mimeType).toBe('image/webp')
        expect(result.sizeBytes).toBe(12345)
        expect(deps.db.insertImageAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'test-uuid-123',
                r2Key: 'blog/test-uuid-123.webp',
                bucket: 'test-bucket',
                uploadedBy: 'user-1',
                sizeBytes: 12345,
                width: 800,
                height: 600,
            }),
        )
    })

    test('토큰 서명이 변조된 경우 UNAUTHORIZED를 throw한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)
        const { assetId, s3Key, uploadToken } = service.prepare('user-1')

        const tampered = uploadToken.slice(0, -4) + 'xxxx'
        await expect(
            service.complete({ assetId, s3Key, uploadToken: tampered, sizeBytes: 1, width: 1, height: 1 }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    test('토큰 형식이 잘못된 경우 UNAUTHORIZED를 throw한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)
        const { assetId, s3Key } = service.prepare('user-1')

        await expect(
            service.complete({ assetId, s3Key, uploadToken: 'invalid', sizeBytes: 1, width: 1, height: 1 }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    test('s3Key가 assetId와 일치하지 않으면 VALIDATION_ERROR를 throw한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)
        const { assetId, uploadToken } = service.prepare('user-1')

        await expect(
            service.complete({
                assetId,
                s3Key: 'blog/other-uuid.webp',
                uploadToken,
                sizeBytes: 1,
                width: 1,
                height: 1,
            }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    test('다른 secret으로 만든 토큰은 거부한다', async () => {
        const deps = createMockDeps()
        const evilService = createBlogImageService({ ...deps, tokenSecret: 'other-secret' })
        const service = createBlogImageService(deps)

        const { assetId, s3Key, uploadToken } = evilService.prepare('user-1')
        await expect(
            service.complete({ assetId, s3Key, uploadToken, sizeBytes: 1, width: 1, height: 1 }),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
})

describe('createBlogImageService.getList', () => {
    test('이미지 목록을 반환한다', async () => {
        const service = createBlogImageService(createMockDeps())
        const result = await service.getList()
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('test-uuid-123')
        expect(result[0].r2Key).toBe('blog/test-uuid-123.webp')
    })
})

describe('createBlogImageService.delete', () => {
    test('R2와 DB에서 이미지를 삭제한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)
        await service.delete('test-uuid-123')
        expect(deps.storage.delete).toHaveBeenCalledWith('blog/test-uuid-123.webp')
        expect(deps.db.deleteImageAsset).toHaveBeenCalledWith('test-uuid-123')
    })

    test('존재하지 않는 이미지는 NOT_FOUND를 throw한다', async () => {
        const deps = createMockDeps()
        deps.db.getImageAssetById = mock(() => Promise.resolve(null))
        const service = createBlogImageService(deps)
        await expect(service.delete('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    test('blog/ prefix가 아닌 r2Key는 FORBIDDEN을 throw한다', async () => {
        const deps = createMockDeps()
        deps.db.getImageAssetById = mock(() => Promise.resolve({ r2Key: 'other/key.webp' }))
        const service = createBlogImageService(deps)
        await expect(service.delete('test-uuid-123')).rejects.toMatchObject({ code: 'FORBIDDEN' })
        expect(deps.storage.delete).not.toHaveBeenCalled()
    })
})
