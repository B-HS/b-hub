import { describe, expect, test, mock } from 'bun:test'
import { createImageGenerator } from '../../../service/shared/image-generator'

describe('createImageGenerator', () => {
    test('generate가 PNG 버퍼를 반환한다', async () => {
        const pngData = new Uint8Array([137, 80, 78, 71])
        const mockResvgInstance = {
            render: () => ({ asPng: () => pngData }),
        }

        const generator = createImageGenerator({
            satori: mock(() => Promise.resolve('<svg></svg>')),
            initWasm: mock(() => Promise.resolve()),
            Resvg: mock(() => mockResvgInstance) as never,
            loadWasm: mock(() => Promise.resolve(new ArrayBuffer(10))),
        })

        const result = await generator.generate('div' as never, {
            width: 100,
            height: 50,
            fonts: [],
        })

        expect(result).toBeInstanceOf(Buffer)
        expect(result[0]).toBe(137)
    })

    test('WASM은 한 번만 초기화된다', async () => {
        const initWasm = mock(() => Promise.resolve())
        const pngData = new Uint8Array([1, 2, 3])

        const generator = createImageGenerator({
            satori: mock(() => Promise.resolve('<svg></svg>')),
            initWasm,
            Resvg: mock(() => ({
                render: () => ({ asPng: () => pngData }),
            })) as never,
            loadWasm: mock(() => Promise.resolve(new ArrayBuffer(10))),
        })

        await generator.generate('div' as never, {
            width: 100,
            height: 50,
            fonts: [],
        })
        await generator.generate('div' as never, {
            width: 100,
            height: 50,
            fonts: [],
        })

        expect(initWasm).toHaveBeenCalledTimes(1)
    })
})
