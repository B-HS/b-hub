import { describe, expect, test, mock } from 'bun:test'
import { createBlogImageService } from '../../../../service/domain/blog/blog-image'

const createMockDeps = () => ({
    storage: {
        upload: mock(() => Promise.resolve()),
        delete: mock(() => Promise.resolve()),
        getUrl: (key: string) => `https://cdn.example.com/${key}`,
    },
    imageProcessor: {
        toWebp: mock(() => Promise.resolve(Buffer.from('webp-data'))),
        getMetadata: mock(() => Promise.resolve({ width: 800, height: 600 })),
    },
    db: {
        insertImageAsset: mock(() => Promise.resolve()),
        getImageList: mock(() =>
            Promise.resolve([
                {
                    imageId: 1,
                    fileName: 'test.webp',
                    originalName: 'photo.jpg',
                    url: 'https://cdn.example.com/blog/test.webp',
                    mimeType: 'image/webp',
                    fileSize: 50000,
                    width: 800,
                    height: 600,
                    createdAt: new Date(),
                },
            ]),
        ),
        insertLegacyImage: mock(() => Promise.resolve({ imageId: 1 })),
    },
    bucket: 'test-bucket',
    generateId: () => 'test-uuid-123',
})

describe('createBlogImageService', () => {
    test('upload는 이미지를 WebP로 변환하고 R2에 업로드한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(1024)], 'photo.jpg', {
            type: 'image/jpeg',
        })
        const result = await service.upload(file, 'user-1')

        expect(result.id).toBe('test-uuid-123')
        expect(result.mimeType).toBe('image/webp')
        expect(result.width).toBe(800)
        expect(result.height).toBe(600)
        expect(result.url).toBe('https://cdn.example.com/blog/test-uuid-123.webp')
        expect(deps.imageProcessor.toWebp).toHaveBeenCalled()
        expect(deps.storage.upload).toHaveBeenCalledWith('blog/test-uuid-123.webp', expect.any(Buffer), 'image/webp')
        expect(deps.db.insertImageAsset).toHaveBeenCalled()
        expect(deps.db.insertLegacyImage).toHaveBeenCalled()
    })

    test('upload는 10MB 초과 파일을 거부한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', {
            type: 'image/jpeg',
        })
        await expect(service.upload(file, 'user-1')).rejects.toMatchObject({ code: 'BLOG_IMAGE_TOO_LARGE' })
    })

    test('upload는 image_assets와 legacy images 테이블 모두에 저장한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(1024)], 'test.png', {
            type: 'image/png',
        })
        await service.upload(file, 'user-1')

        expect(deps.db.insertImageAsset).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'test-uuid-123',
                r2Key: 'blog/test-uuid-123.webp',
                bucket: 'test-bucket',
                uploadedBy: 'user-1',
            }),
        )
        expect(deps.db.insertLegacyImage).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                fileName: 'test-uuid-123.webp',
                originalName: 'test.png',
            }),
        )
    })

    test('upload는 허용되지 않는 MIME 타입을 거부한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const pdfFile = new File([new ArrayBuffer(1024)], 'doc.pdf', {
            type: 'application/pdf',
        })
        await expect(service.upload(pdfFile, 'user-1')).rejects.toMatchObject({ code: 'BLOG_IMAGE_INVALID_TYPE' })

        const textFile = new File([new ArrayBuffer(1024)], 'readme.txt', {
            type: 'text/plain',
        })
        await expect(service.upload(textFile, 'user-1')).rejects.toMatchObject({ code: 'BLOG_IMAGE_INVALID_TYPE' })

        const htmlFile = new File([new ArrayBuffer(1024)], 'page.html', {
            type: 'text/html',
        })
        await expect(service.upload(htmlFile, 'user-1')).rejects.toMatchObject({ code: 'BLOG_IMAGE_INVALID_TYPE' })
    })

    test('upload는 SVG 파일을 거부한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const svgFile = new File(['<svg></svg>'], 'icon.svg', {
            type: 'image/svg+xml',
        })
        await expect(service.upload(svgFile, 'user-1')).rejects.toMatchObject({ code: 'BLOG_IMAGE_INVALID_TYPE' })
    })

    test('upload는 storage 업로드 실패 시 에러를 throw한다', async () => {
        const deps = createMockDeps()
        deps.storage.upload = mock(() => Promise.reject(new Error('R2 upload failed')))
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' })
        await expect(service.upload(file, 'user-1')).rejects.toThrow('R2 upload failed')
    })

    test('upload는 imageProcessor 실패 시 에러를 throw한다', async () => {
        const deps = createMockDeps()
        deps.imageProcessor.toWebp = mock(() => Promise.reject(new Error('Sharp conversion failed')))
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' })
        await expect(service.upload(file, 'user-1')).rejects.toThrow('Sharp conversion failed')
    })

    test('getList는 이미지 목록을 반환한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const result = await service.getList()
        expect(result).toHaveLength(1)
        expect(result[0].imageId).toBe(1)
    })

    test('이미지 메타데이터 추출 실패 시 에러를 전파한다', async () => {
        const deps = createMockDeps()
        deps.imageProcessor.getMetadata = mock(() => Promise.reject(new Error('Metadata extraction failed')))
        const service = createBlogImageService(deps)

        const file = new File([new ArrayBuffer(1024)], 'photo.jpg', { type: 'image/jpeg' })
        await expect(service.upload(file, 'user-1')).rejects.toThrow('Metadata extraction failed')
    })

    test('0 바이트 파일도 MIME 타입이 유효하면 업로드를 시도한다', async () => {
        const deps = createMockDeps()
        const service = createBlogImageService(deps)

        const file = new File([], 'empty.jpg', { type: 'image/jpeg' })
        const result = await service.upload(file, 'user-1')
        expect(result.id).toBe('test-uuid-123')
        expect(deps.imageProcessor.toWebp).toHaveBeenCalled()
    })
})
