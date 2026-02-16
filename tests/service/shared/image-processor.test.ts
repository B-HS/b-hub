import { describe, expect, test, mock } from 'bun:test'
import { createImageProcessor } from '../../../service/shared/image-processor'

const createMockSharp = () => {
    const instance = {
        webp: mock(() => instance),
        png: mock(() => instance),
        resize: mock(() => instance),
        toBuffer: mock(() => Promise.resolve(Buffer.from('processed'))),
        metadata: mock(() => Promise.resolve({ width: 800, height: 600, format: 'webp' })),
    }
    return mock(() => instance)
}

describe('createImageProcessor', () => {
    test('toWebp가 WebP 변환을 수행한다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        const result = await processor.toWebp(Buffer.from('image'))
        expect(result.toString()).toBe('processed')
        expect(sharp().webp).toHaveBeenCalled()
    })

    test('toPng가 PNG 변환을 수행한다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        const result = await processor.toPng(Buffer.from('image'))
        expect(result.toString()).toBe('processed')
    })

    test('resize가 리사이즈를 수행한다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        await processor.resize(Buffer.from('image'), 400, 300)
        expect(sharp().resize).toHaveBeenCalledWith(400, 300, { fit: 'inside' })
    })

    test('getMetadata가 이미지 메타데이터를 반환한다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        const meta = await processor.getMetadata(Buffer.from('image'))
        expect(meta.width).toBe(800)
        expect(meta.height).toBe(600)
        expect(meta.format).toBe('webp')
    })

    test('10MB 초과 이미지는 에러를 던진다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024)
        expect(processor.toWebp(largeBuffer)).rejects.toThrow('IMAGE_TOO_LARGE')
    })

    test('toPng도 10MB 초과시 에러를 던진다', async () => {
        const sharp = createMockSharp()
        const processor = createImageProcessor({ sharp })
        const largeBuffer = Buffer.alloc(11 * 1024 * 1024)
        expect(processor.toPng(largeBuffer)).rejects.toThrow('IMAGE_TOO_LARGE')
    })

    test('metadata가 없으면 기본값을 반환한다', async () => {
        const instance = {
            webp: mock(() => instance),
            png: mock(() => instance),
            resize: mock(() => instance),
            toBuffer: mock(() => Promise.resolve(Buffer.from(''))),
            metadata: mock(() => Promise.resolve({})),
        }
        const sharp = mock(() => instance)
        const processor = createImageProcessor({ sharp })
        const meta = await processor.getMetadata(Buffer.from(''))
        expect(meta.width).toBe(0)
        expect(meta.height).toBe(0)
        expect(meta.format).toBe('unknown')
    })
})
