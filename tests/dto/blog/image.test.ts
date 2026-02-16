import { describe, expect, test } from 'bun:test'
import { imageUploadResponseSchema, imageListResponseSchema } from '../../../dto/blog/image'

describe('imageUploadResponseSchema', () => {
    test('유효한 업로드 응답을 파싱한다', () => {
        const result = imageUploadResponseSchema.parse({
            id: 'img-uuid-123',
            url: 'https://cdn.example.com/image.webp',
            mimeType: 'image/webp',
            sizeBytes: 102400,
            width: 800,
            height: 600,
        })
        expect(result.id).toBe('img-uuid-123')
        expect(result.sizeBytes).toBe(102400)
    })

    test('width/height가 nullable이다', () => {
        const result = imageUploadResponseSchema.parse({
            id: 'img-1',
            url: 'https://cdn.example.com/image.svg',
            mimeType: 'image/svg+xml',
            sizeBytes: 1024,
            width: null,
            height: null,
        })
        expect(result.width).toBeNull()
        expect(result.height).toBeNull()
    })
})

describe('imageListResponseSchema', () => {
    test('이미지 목록을 파싱한다', () => {
        const result = imageListResponseSchema.parse({
            images: [
                {
                    imageId: 1,
                    fileName: 'image.webp',
                    originalName: 'photo.jpg',
                    url: 'https://cdn.example.com/image.webp',
                    mimeType: 'image/webp',
                    fileSize: 50000,
                    width: 1920,
                    height: 1080,
                    createdAt: '2025-01-01T00:00:00Z',
                },
            ],
        })
        expect(result.images).toHaveLength(1)
    })

    test('빈 목록을 파싱한다', () => {
        const result = imageListResponseSchema.parse({ images: [] })
        expect(result.images).toHaveLength(0)
    })
})
