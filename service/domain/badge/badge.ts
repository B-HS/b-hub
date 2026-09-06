import { createHash } from 'crypto'
import type { ReactNode } from 'hono/jsx'
import { createAppError } from '../../../lib/error'
import { captureException } from '../../../lib/sentry'
import type { FontLoader } from '../../shared/font-loader'
import type { IconLoader } from '../../shared/icon-loader'
import type { ImageGenerator } from '../../shared/image-generator'

type BadgeRequest = {
    width: number
    height: number
    text: string
    font: string
    fontSize?: number
    fontWeight: number
    color: string
    backgroundColor: string
    icon: string
    iconUrl: string
    iconSize: number
    tailwind: string
    css: Record<string, string | number>
}

type BadgeDeps = {
    imageGenerator: ImageGenerator
    fontLoader: FontLoader
    iconLoader: IconLoader
    cache: {
        get: (key: string) => Buffer | null
        set: (key: string, value: Buffer, ttlMs?: number) => void
    }
    convertTailwindToCSS?: (classes: string) => Record<string, string | number>
    mergeStyles?: (...styles: Array<Record<string, string | number>>) => Record<string, string | number>
}

const generateCacheKey = (request: BadgeRequest) => {
    const keyInput = {
        width: request.width,
        height: request.height,
        text: request.text,
        font: request.font,
        fontSize: request.fontSize,
        fontWeight: request.fontWeight,
        color: request.color,
        backgroundColor: request.backgroundColor,
        icon: request.icon,
        iconUrl: request.iconUrl,
        iconSize: request.iconSize,
        tailwind: request.tailwind,
        css: JSON.stringify(request.css),
    }
    const serialized = JSON.stringify(keyInput, Object.keys(keyInput).sort())
    return createHash('sha256').update(serialized).digest('hex').slice(0, 16)
}

const defaultMergeStyles = (...styles: Array<Record<string, string | number>>) => Object.assign({}, ...styles)

export const createBadgeService = (deps: BadgeDeps) => {
    const mergeStyles = deps.mergeStyles ?? defaultMergeStyles
    const convertTailwind = deps.convertTailwindToCSS ?? (() => ({}))

    const generate = async (request: BadgeRequest) => {
        const cacheKey = generateCacheKey(request)
        const cached = deps.cache.get(cacheKey)
        if (cached) return { buffer: cached, cacheHit: true }

        const fontConfig = await deps.fontLoader.load(request.font, request.fontWeight)
        const fonts = fontConfig
            ? [
                  {
                      name: fontConfig.name,
                      data: fontConfig.data,
                      weight: fontConfig.weight,
                      style: fontConfig.style,
                  },
              ]
            : []

        let iconDataUrl: string | undefined
        if (request.iconUrl) {
            iconDataUrl = (await deps.iconLoader.loadFromUrl(request.iconUrl)) ?? undefined
        } else if (request.icon) {
            iconDataUrl = (await deps.iconLoader.loadLocal(request.icon)) ?? undefined
        }

        const tailwindStyles = convertTailwind(request.tailwind)
        const computedStyles = mergeStyles(tailwindStyles, request.css)

        const fontSize = request.fontSize || Math.round(request.height * 0.5)
        const iconSize = request.iconSize || Math.round(fontSize * 1.2)
        const gap = Math.round(request.height * 0.08)

        const containerStyle: Record<string, string | number> = {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: `${gap}px`,
            backgroundColor: request.backgroundColor,
            ...computedStyles,
        }

        const textStyle: Record<string, string | number> = {
            color: request.color,
            fontSize,
            fontWeight: request.fontWeight,
            fontFamily: request.font,
            lineHeight: 1.2,
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
        }

        const children: ReactNode[] = []
        if (iconDataUrl) {
            children.push({
                type: 'img',
                props: {
                    src: iconDataUrl,
                    width: iconSize,
                    height: iconSize,
                    style: { objectFit: 'contain' },
                },
                key: null,
            } as ReactNode)
        }
        if (request.text) {
            children.push({
                type: 'span',
                props: { style: textStyle, children: request.text },
                key: null,
            } as ReactNode)
        }
        const element = {
            type: 'div',
            props: { style: containerStyle, children },
            key: null,
        } as ReactNode

        const buffer = await (async () => {
            try {
                return await deps.imageGenerator.generate(element, {
                    width: request.width,
                    height: request.height,
                    fonts,
                })
            } catch (error) {
                captureException(error)
                throw createAppError('IMAGE_GENERATE_FAILED')
            }
        })()

        deps.cache.set(cacheKey, buffer, 24 * 60 * 60 * 1000)
        return { buffer, cacheHit: false }
    }

    const getAvailableFonts = () => deps.fontLoader.getAvailableFonts()

    return { generate, getAvailableFonts, generateCacheKey }
}

export type BadgeService = ReturnType<typeof createBadgeService>
