import { describe, expect, test } from 'bun:test'
import { imageCompleteRequestSchema, imageCompleteResponseSchema, imageListResponseSchema, imagePrepareResponseSchema } from '../../../dto/blog/image'

const validUuid = '11111111-1111-4111-8111-111111111111'

describe('imagePrepareResponseSchema', () => {
    test('유효한 준비 응답을 파싱한다', () => {
        const result = imagePrepareResponseSchema.parse({
            assetId: validUuid,
            s3Key: 'image_assets/2026/05/abc.webp',
            uploadToken: 'tok-123',
            uploadUrl: 'https://upload.example.com/put',
            expiresAt: 1764500000,
        })
        expect(result.assetId).toBe(validUuid)
        expect(result.expiresAt).toBe(1764500000)
    })

    test('expiresAt이 숫자가 아니면 거부한다', () => {
        expect(() =>
            imagePrepareResponseSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                uploadUrl: 'u',
                expiresAt: 'soon',
            }),
        ).toThrow()
    })

    test('필수 필드가 빠지면 거부한다', () => {
        expect(() => imagePrepareResponseSchema.parse({ assetId: validUuid })).toThrow()
    })
})

describe('imageCompleteRequestSchema', () => {
    test('유효한 완료 요청을 파싱한다', () => {
        const result = imageCompleteRequestSchema.parse({
            assetId: validUuid,
            s3Key: 'image_assets/2026/05/abc.webp',
            uploadToken: 'tok-123',
            sizeBytes: 102400,
            width: 800,
            height: 600,
        })
        expect(result.sizeBytes).toBe(102400)
        expect(result.width).toBe(800)
    })

    test('width/height가 null이어도 파싱한다', () => {
        const result = imageCompleteRequestSchema.parse({
            assetId: validUuid,
            s3Key: 'k',
            uploadToken: 't',
            sizeBytes: 1024,
            width: null,
            height: null,
        })
        expect(result.width).toBeNull()
        expect(result.height).toBeNull()
    })

    test('assetId가 uuid가 아니면 거부한다', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: 'not-a-uuid',
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: 1024,
                width: null,
                height: null,
            }),
        ).toThrow()
    })

    test('sizeBytes가 0이면 거부한다 (positive)', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: 0,
                width: null,
                height: null,
            }),
        ).toThrow()
    })

    test('sizeBytes가 음수이면 거부한다', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: -1,
                width: null,
                height: null,
            }),
        ).toThrow()
    })

    test('sizeBytes가 정수가 아니면 거부한다', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: 10.5,
                width: null,
                height: null,
            }),
        ).toThrow()
    })

    test('width가 0이면 null로 변환한다 (upload-server 메타 실패 대응)', () => {
        const result = imageCompleteRequestSchema.parse({
            assetId: validUuid,
            s3Key: 'k',
            uploadToken: 't',
            sizeBytes: 1024,
            width: 0,
            height: 100,
        })
        expect(result.width).toBeNull()
        expect(result.height).toBe(100)
    })

    test('width/height가 모두 0이면 둘 다 null로 변환한다', () => {
        const result = imageCompleteRequestSchema.parse({
            assetId: validUuid,
            s3Key: 'k',
            uploadToken: 't',
            sizeBytes: 1024,
            width: 0,
            height: 0,
        })
        expect(result.width).toBeNull()
        expect(result.height).toBeNull()
    })

    test('width가 음수이면 거부한다', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: 1024,
                width: -1,
                height: 100,
            }),
        ).toThrow()
    })

    test('양수 width/height는 그대로 유지한다', () => {
        const result = imageCompleteRequestSchema.parse({
            assetId: validUuid,
            s3Key: 'k',
            uploadToken: 't',
            sizeBytes: 1024,
            width: 1920,
            height: 1080,
        })
        expect(result.width).toBe(1920)
        expect(result.height).toBe(1080)
    })

    test('width가 누락되면 거부한다 (nullable이지만 optional은 아님)', () => {
        expect(() =>
            imageCompleteRequestSchema.parse({
                assetId: validUuid,
                s3Key: 'k',
                uploadToken: 't',
                sizeBytes: 1024,
                height: null,
            }),
        ).toThrow()
    })
})

describe('imageCompleteResponseSchema', () => {
    test('유효한 완료 응답을 파싱한다', () => {
        const result = imageCompleteResponseSchema.parse({
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
        const result = imageCompleteResponseSchema.parse({
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

    test('id가 빠지면 거부한다', () => {
        expect(() =>
            imageCompleteResponseSchema.parse({
                url: 'https://cdn.example.com/image.webp',
                mimeType: 'image/webp',
                sizeBytes: 1024,
                width: null,
                height: null,
            }),
        ).toThrow()
    })
})

describe('imageListResponseSchema', () => {
    test('이미지 목록을 파싱한다', () => {
        const result = imageListResponseSchema.parse({
            images: [
                {
                    id: 'img-1',
                    r2Key: 'image_assets/2026/05/abc.webp',
                    url: 'https://cdn.example.com/image.webp',
                    mimeType: 'image/webp',
                    sizeBytes: 50000,
                    width: 1920,
                    height: 1080,
                    createdAt: '2026-01-01T00:00:00Z',
                },
            ],
        })
        expect(result.images).toHaveLength(1)
        expect(result.images[0].r2Key).toBe('image_assets/2026/05/abc.webp')
    })

    test('빈 목록을 파싱한다', () => {
        const result = imageListResponseSchema.parse({ images: [] })
        expect(result.images).toHaveLength(0)
    })

    test('width/height가 null인 항목을 파싱한다', () => {
        const result = imageListResponseSchema.parse({
            images: [
                {
                    id: 'img-2',
                    r2Key: 'image_assets/2026/05/icon.svg',
                    url: 'https://cdn.example.com/icon.svg',
                    mimeType: 'image/svg+xml',
                    sizeBytes: 800,
                    width: null,
                    height: null,
                    createdAt: '2026-01-02T00:00:00Z',
                },
            ],
        })
        expect(result.images[0].width).toBeNull()
    })

    test('필수 필드(r2Key)가 빠진 항목은 거부한다', () => {
        expect(() =>
            imageListResponseSchema.parse({
                images: [
                    {
                        id: 'img-3',
                        url: 'https://cdn.example.com/x.webp',
                        mimeType: 'image/webp',
                        sizeBytes: 100,
                        width: null,
                        height: null,
                        createdAt: '2026-01-03T00:00:00Z',
                    },
                ],
            }),
        ).toThrow()
    })
})
