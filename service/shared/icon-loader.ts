import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { isPublicUrl } from '../../lib/url-validator'

type IconLoaderDeps = {
    fetchFn?: typeof fetch
    iconDir?: string
    parseICO?: (buffer: ArrayBuffer, mime: string) => Promise<Array<{ width: number; buffer: ArrayBuffer }>>
}

const basePath = process.env.VERCEL ? '/var/task' : process.cwd()
const SAFE_ICON_NAME = /^[a-zA-Z0-9_-]+$/
const FETCH_TIMEOUT_MS = 8000
const MAX_REDIRECT_HOPS = 3

export const createIconLoader = (deps: IconLoaderDeps = {}) => {
    const iconCache = new Map<string, string>()
    const fetchFn = deps.fetchFn ?? fetch
    const iconDir = deps.iconDir ?? join(basePath, 'public', 'icon')
    let availableIcons: string[] = []

    const loadAvailableIcons = async () => {
        if (availableIcons.length > 0) return availableIcons
        try {
            const files = await readdir(iconDir)
            availableIcons = files.filter((f) => f.endsWith('.svg') || f.endsWith('.png')).map((f) => f.replace(/\.(svg|png)$/, ''))
            return availableIcons
        } catch {
            return []
        }
    }

    const loadLocal = async (name: string): Promise<string | null> => {
        if (!SAFE_ICON_NAME.test(name)) return null
        if (iconCache.has(name)) return iconCache.get(name)!

        const svgPath = join(iconDir, `${name}.svg`)
        const pngPath = join(iconDir, `${name}.png`)

        try {
            const buffer = await readFile(svgPath)
            const dataUrl = `data:image/svg+xml;base64,${buffer.toString('base64')}`
            iconCache.set(name, dataUrl)
            return dataUrl
        } catch {
            try {
                const buffer = await readFile(pngPath)
                const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
                iconCache.set(name, dataUrl)
                return dataUrl
            } catch {
                return null
            }
        }
    }

    const sanitizeSvg = (svgContent: string) => {
        let svg = svgContent
            .replace(/<\?xml[^>]*\?>/gi, '')
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .trim()

        svg = svg.replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
        svg = svg.replace(/\s(on\w+)\s*=\s*"[^"]*"/gi, '')
        svg = svg.replace(/\s(on\w+)\s*=\s*'[^']*'/gi, '')
        svg = svg.replace(/\s(on\w+)\s*=\s*[^\s>]+/gi, '')
        svg = svg.replace(/xlink:href\s*=\s*["'](?!#)[^"']*["']/gi, '')
        svg = svg.replace(/href\s*=\s*["']\s*(javascript|data|vbscript)\s*:[^"']*["']/gi, '')

        if (!svg.includes('xmlns=')) {
            svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
        }

        if (!svg.includes('viewBox')) {
            const widthMatch = svg.match(/width=["']?(\d+(?:\.\d+)?)(px)?["']?/i)
            const heightMatch = svg.match(/height=["']?(\d+(?:\.\d+)?)(px)?["']?/i)
            if (widthMatch && heightMatch) {
                const width = parseFloat(widthMatch[1])
                const height = parseFloat(heightMatch[1])
                svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`)
            }
        }

        return svg
    }

    const detectMimeType = (buffer: ArrayBuffer, contentType: string, url: string) => {
        const bytes = new Uint8Array(buffer)

        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
        if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'image/x-icon'

        const text = Buffer.from(buffer).toString('utf-8').trim()
        if (text.startsWith('<svg') || text.startsWith('<?xml') || text.includes('<svg')) return 'image/svg+xml'

        if (url.endsWith('.svg')) return 'image/svg+xml'
        if (url.endsWith('.png')) return 'image/png'
        if (url.endsWith('.ico')) return 'image/x-icon'

        return contentType || 'image/png'
    }

    const loadFromUrl = async (url: string): Promise<string | null> => {
        if (!isPublicUrl(url)) return null
        if (iconCache.has(url)) return iconCache.get(url)!

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

            const doFetch = (target: string) =>
                fetchFn(target, {
                    signal: controller.signal,
                    redirect: 'manual',
                    headers: { 'User-Agent': 'Mozilla/5.0 Badge-Generator/1.0' },
                })

            let currentUrl = url
            let response = await doFetch(currentUrl)
            let hop = 0
            while (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location')
                if (!location || hop >= MAX_REDIRECT_HOPS) {
                    clearTimeout(timeoutId)
                    return null
                }
                const nextUrl = new URL(location, currentUrl).toString()
                if (!isPublicUrl(nextUrl)) {
                    clearTimeout(timeoutId)
                    return null
                }
                currentUrl = nextUrl
                hop += 1
                response = await doFetch(currentUrl)
            }
            clearTimeout(timeoutId)

            if (!response.ok) return null

            const contentType = response.headers.get('content-type') || ''
            let buffer = await response.arrayBuffer()
            let mimeType = detectMimeType(buffer, contentType, url)

            if (mimeType === 'image/x-icon' && deps.parseICO) {
                const images = await deps.parseICO(buffer, 'image/png')
                if (images.length > 0) {
                    const largest = images.reduce((a, b) => (a.width > b.width ? a : b))
                    buffer = largest.buffer
                    mimeType = 'image/png'
                }
            }

            if (mimeType === 'image/svg+xml') {
                const svgText = Buffer.from(buffer).toString('utf-8')
                const sanitized = sanitizeSvg(svgText)
                const base64 = Buffer.from(sanitized).toString('base64')
                const dataUrl = `data:${mimeType};base64,${base64}`
                iconCache.set(url, dataUrl)
                return dataUrl
            }

            const base64 = Buffer.from(buffer).toString('base64')
            const dataUrl = `data:${mimeType};base64,${base64}`
            iconCache.set(url, dataUrl)
            return dataUrl
        } catch {
            return null
        }
    }

    return { loadLocal, loadFromUrl, loadAvailableIcons }
}

export type IconLoader = ReturnType<typeof createIconLoader>
