import { readFile } from 'fs/promises'
import { join } from 'path'
import { createCache } from './cache'

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

const FONT_CACHE_MAX_SIZE = 50
const FONT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FONT_FETCH_TIMEOUT_MS = 8000

export const createFontLoader = (deps: FontLoaderDeps = {}) => {
    const fontCache = createCache<ArrayBuffer>({ maxSize: FONT_CACHE_MAX_SIZE, defaultTtlMs: FONT_CACHE_TTL_MS })
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

    const readLocalFont = async (name: string, weight: number) => {
        const fontInfo = LOCAL_FONTS.find((f) => f.name === name)
        if (!fontInfo) return null

        const closestWeight = fontInfo.weights.reduce((prev, curr) => (Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev))

        const filePath = getFontFilePath(name, closestWeight)
        if (!filePath) return null

        try {
            const buffer = await readFile(filePath)
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        } catch {
            return null
        }
    }

    const loadLocal = async (name: string, weight: number): Promise<ArrayBuffer | null> => {
        const cacheKey = `local-${name}-${weight}`
        const cached = fontCache.get(cacheKey)
        if (cached) return cached

        const arrayBuffer = await readLocalFont(name, weight)
        if (!arrayBuffer) return null

        fontCache.set(cacheKey, arrayBuffer)
        return arrayBuffer
    }

    const fetchGoogleFont = async (name: string, weight: number): Promise<ArrayBuffer | null> => {
        try {
            const encodedName = encodeURIComponent(name)
            const cssUrl = `https://fonts.googleapis.com/css2?family=${encodedName}:wght@${weight}&display=swap`

            const cssResponse = await fetchFn(cssUrl, {
                signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                },
            })
            if (!cssResponse.ok) return null

            const css = await cssResponse.text()
            const fontUrlMatch = css.match(/url\(([^)]+)\)/)
            if (!fontUrlMatch) return null

            const fontUrl = fontUrlMatch[1].replace(/['"]/g, '')
            const fontResponse = await fetchFn(fontUrl, { signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS) })
            if (!fontResponse.ok) return null

            return await fontResponse.arrayBuffer()
        } catch {
            return null
        }
    }

    const loadGoogle = async (name: string, weight: number): Promise<ArrayBuffer | null> => {
        const cacheKey = `google-${name}-${weight}`
        const cached = fontCache.get(cacheKey)
        if (cached) return cached

        const arrayBuffer = await fetchGoogleFont(name, weight)
        if (!arrayBuffer) return null

        fontCache.set(cacheKey, arrayBuffer)
        return arrayBuffer
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
