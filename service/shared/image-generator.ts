import type { ReactNode } from 'hono/jsx'

type SatoriOptions = {
    width: number
    height: number
    fonts: Array<{
        name: string
        data: ArrayBuffer
        weight: number
        style: string
    }>
}

type SatoriFn = (element: ReactNode, options: SatoriOptions) => Promise<string>

type ResvgInit = (wasmBuffer: ArrayBuffer) => Promise<void>
type ResvgCtor = new (
    svg: string,
    options: Record<string, unknown>,
) => {
    render: () => { asPng: () => Uint8Array }
}

type ImageGeneratorDeps = {
    satori: SatoriFn
    initWasm: ResvgInit
    Resvg: ResvgCtor
    loadWasm: () => Promise<ArrayBuffer>
}

export const createImageGenerator = (deps: ImageGeneratorDeps) => {
    let initPromise: Promise<void> | null = null

    const ensureWasm = async () => {
        initPromise ??= (async () => {
            const wasmBuffer = await deps.loadWasm()
            await deps.initWasm(wasmBuffer)
        })()

        try {
            await initPromise
        } catch (error) {
            initPromise = null
            throw error
        }
    }

    const generate = async (
        element: ReactNode,
        options: {
            width: number
            height: number
            fonts: Array<{
                name: string
                data: ArrayBuffer
                weight: number
                style: string
            }>
        },
    ) => {
        await ensureWasm()

        const svg = await deps.satori(element, {
            width: options.width,
            height: options.height,
            fonts: options.fonts,
        })

        const resvg = new deps.Resvg(svg, {
            fitTo: { mode: 'width', value: options.width },
        })

        const pngData = resvg.render()
        return Buffer.from(pngData.asPng())
    }

    return { generate }
}

export type ImageGenerator = ReturnType<typeof createImageGenerator>
