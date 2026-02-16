import { readFile } from 'fs/promises'
import { join } from 'path'

type FontInfo = {
    name: string
    weights: number[]
}

type FontConfig = {
    name: string
    data: ArrayBuffer
    weight: number
    style: string
    source: 'local' | 'google'
}

type FontLoaderDeps = {
    fetchFn?: typeof fetch
}

const basePath = process.env.VERCEL ? '/var/task' : process.cwd()
const FONTSOURCE_DIR = join(basePath, 'node_modules', '@fontsource')

const LOCAL_FONTS: FontInfo[] = [
    { name: 'Inter', weights: [400, 700] },
    { name: 'Noto Sans KR', weights: [400, 700] },
]

export const createFontLoader = (deps: FontLoaderDeps = {}) => {
    const fontCache = new Map<string, ArrayBuffer>()
    const fetchFn = deps.fetchFn ?? fetch

    const getFontFilePath = (name: string, weight: number) => {
        if (name === 'Inter') {
            return join(FONTSOURCE_DIR, 'inter', 'files', `inter-latin-${weight}-normal.woff`)
        }
        if (name === 'Noto Sans KR') {
            return join(FONTSOURCE_DIR, 'noto-sans-kr', 'files', `noto-sans-kr-korean-${weight}-normal.woff`)
        }
        return ''
    }

    const loadLocal = async (name: string, weight: number): Promise<ArrayBuffer | null> => {
        const cacheKey = `local-${name}-${weight}`
        if (fontCache.has(cacheKey)) return fontCache.get(cacheKey)!

        const fontInfo = LOCAL_FONTS.find((f) => f.name === name)
        if (!fontInfo) return null

        const closestWeight = fontInfo.weights.reduce((prev, curr) => (Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev))

        const filePath = getFontFilePath(name, closestWeight)
        if (!filePath) return null

        try {
            const buffer = await readFile(filePath)
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            fontCache.set(cacheKey, arrayBuffer)
            return arrayBuffer
        } catch {
            return null
        }
    }

    const loadGoogle = async (name: string, weight: number): Promise<ArrayBuffer | null> => {
        const cacheKey = `google-${name}-${weight}`
        if (fontCache.has(cacheKey)) return fontCache.get(cacheKey)!

        try {
            const encodedName = encodeURIComponent(name)
            const cssUrl = `https://fonts.googleapis.com/css2?family=${encodedName}:wght@${weight}&display=swap`

            const cssResponse = await fetchFn(cssUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                },
            })
            if (!cssResponse.ok) return null

            const css = await cssResponse.text()
            const fontUrlMatch = css.match(/url\(([^)]+)\)/)
            if (!fontUrlMatch) return null

            const fontUrl = fontUrlMatch[1].replace(/['"]/g, '')
            const fontResponse = await fetchFn(fontUrl)
            if (!fontResponse.ok) return null

            const arrayBuffer = await fontResponse.arrayBuffer()
            fontCache.set(cacheKey, arrayBuffer)
            return arrayBuffer
        } catch {
            return null
        }
    }

    const load = async (name: string, weight: number): Promise<FontConfig | null> => {
        let data = await loadLocal(name, weight)
        let source: 'local' | 'google' = 'local'
        let fontName = name

        if (!data) {
            data = await loadGoogle(name, weight)
            source = 'google'
        }

        if (!data) {
            data = await loadLocal('Inter', weight)
            source = 'local'
            fontName = 'Inter'
        }

        if (!data) return null

        return { name: fontName, data, weight, style: 'normal', source }
    }

    const getAvailableFonts = () => ({
        local: LOCAL_FONTS,
        googleFontsSupported: true,
    })

    return { load, loadLocal, loadGoogle, getAvailableFonts }
}

export type FontLoader = ReturnType<typeof createFontLoader>
