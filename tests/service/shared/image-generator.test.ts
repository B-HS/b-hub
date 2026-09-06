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

describe('createImageGenerator WASM 초기화', () => {
    const createDeferredWasmGenerator = () => {
        let resolveWasm: (buffer: ArrayBuffer) => void = () => {}
        const loadWasm = mock(
            () =>
                new Promise<ArrayBuffer>((resolve) => {
                    resolveWasm = resolve
                }),
        )
        const initWasm = mock(() => Promise.resolve())
        const generator = createImageGenerator({
            satori: mock(() => Promise.resolve('<svg></svg>')),
            initWasm,
            Resvg: mock(() => ({ render: () => ({ asPng: () => new Uint8Array([1]) }) })) as never,
            loadWasm,
        })
        return { generator, initWasm, loadWasm, resolveWasm: (buffer: ArrayBuffer) => resolveWasm(buffer) }
    }

    test('동시 첫 호출에도 initWasm은 한 번만 실행된다', async () => {
        const { generator, initWasm, loadWasm, resolveWasm } = createDeferredWasmGenerator()

        const first = generator.generate('div' as never, { width: 10, height: 10, fonts: [] })
        const second = generator.generate('div' as never, { width: 10, height: 10, fonts: [] })
        resolveWasm(new ArrayBuffer(10))
        await Promise.all([first, second])

        expect(loadWasm).toHaveBeenCalledTimes(1)
        expect(initWasm).toHaveBeenCalledTimes(1)
    })

    test('초기화가 실패하면 다음 호출에서 다시 시도한다', async () => {
        let attempt = 0
        const initWasm = mock(() => {
            attempt += 1
            return attempt === 1 ? Promise.reject(new Error('wasm boom')) : Promise.resolve()
        })
        const generator = createImageGenerator({
            satori: mock(() => Promise.resolve('<svg></svg>')),
            initWasm,
            Resvg: mock(() => ({ render: () => ({ asPng: () => new Uint8Array([1]) }) })) as never,
            loadWasm: mock(() => Promise.resolve(new ArrayBuffer(10))),
        })

        const failure = await generator.generate('div' as never, { width: 10, height: 10, fonts: [] }).catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(Error)

        const buffer = await generator.generate('div' as never, { width: 10, height: 10, fonts: [] })
        expect(buffer).toBeInstanceOf(Buffer)
        expect(initWasm).toHaveBeenCalledTimes(2)
    })
})
