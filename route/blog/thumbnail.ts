import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { withErrorHandling } from '../../lib/with-error-handling'
import { createAppError } from '../../lib/error'
import type { PostService } from '../../service/domain/blog/post'
import type { ImageGenerator } from '../../service/shared/image-generator'
import type { FontLoader } from '../../service/shared/font-loader'

type ThumbnailRouteDeps = {
    postService: PostService
    imageGenerator: ImageGenerator
    fontLoader: FontLoader
}

const GRID_ROWS = 13
const GRID_COLS = 25
const GRID_CELL_WIDTH = 1200 / GRID_COLS
const GRID_CELL_HEIGHT = 630 / GRID_ROWS

const generateGridOpacity = (rows: number, cols: number) =>
    Array.from({ length: rows }, (_, rowIndex) =>
        Array.from({ length: cols }, (_, colIndex) => {
            const baseOpacity = (rowIndex + colIndex) * 0.015
            return Math.min(baseOpacity + rowIndex * 0.02, 0.6)
        }),
    )

const GRID_OPACITY = generateGridOpacity(GRID_ROWS, GRID_COLS)

export const createThumbnailRoute = (deps: ThumbnailRouteDeps) => {
    const route = new Hono()

    route.get(
        '/:id/thumbnail',
        describeRoute({
            tags: ['Blog'],
            summary: '게시글 썸네일 이미지 생성',
            responses: { 200: { description: 'PNG 이미지' } },
        }),
        withErrorHandling(async (c) => {
            const id = Number(c.req.param('id'))
            if (isNaN(id)) throw createAppError('BLOG_POST_NOT_FOUND')

            const post = await deps.postService.getById(id)
            if (!post) throw createAppError('BLOG_POST_NOT_FOUND')

            const title = post.title
            const category = post.categoryName
            const tag = post.tags[0]?.tag

            const [fontRegular, fontBold] = await Promise.all([deps.fontLoader.load('Noto Sans KR', 400), deps.fontLoader.load('Noto Sans KR', 700)])

            const fonts = [fontRegular, fontBold]
                .filter((f): f is NonNullable<typeof f> => f !== null)
                .map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style }))

            const baseTextStyle = {
                fontFamily: 'Noto Sans KR',
                color: '#ffffff',
                letterSpacing: '1.5px',
            }

            const badgeStyle = {
                ...baseTextStyle,
                padding: '12px 32px',
                fontSize: '42px',
                border: '2px solid rgba(255, 255, 255, 0.35)',
                background: 'rgba(255, 255, 255, 0.15)',
            }

            const element = {
                type: 'div',
                props: {
                    style: { width: 1200, height: 630, position: 'relative', background: '#0a0a0a', display: 'flex' },
                    children: [
                        {
                            type: 'div',
                            props: {
                                style: {
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                },
                                children: GRID_OPACITY.map((row) => ({
                                    type: 'div',
                                    props: {
                                        style: { display: 'flex', height: `${GRID_CELL_HEIGHT}px` },
                                        children: row.map((opacity) => ({
                                            type: 'div',
                                            props: {
                                                style: {
                                                    width: `${GRID_CELL_WIDTH}px`,
                                                    background: `rgba(255, 255, 255, ${opacity})`,
                                                },
                                            },
                                        })),
                                    },
                                })),
                            },
                        },
                        {
                            type: 'div',
                            props: {
                                style: {
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    padding: '60px 80px',
                                    position: 'relative',
                                },
                                children: [
                                    {
                                        type: 'div',
                                        props: {
                                            style: { display: 'flex', gap: 16 },
                                            children: [
                                                { type: 'span', props: { style: badgeStyle, children: category } },
                                                { type: 'span', props: { style: badgeStyle, children: tag } },
                                            ],
                                        },
                                    },
                                    {
                                        type: 'div',
                                        props: {
                                            style: {
                                                ...baseTextStyle,
                                                fontSize: 80,
                                                fontWeight: 900,
                                                lineHeight: 1.05,
                                                maxWidth: '95%',
                                                textTransform: 'uppercase',
                                                letterSpacing: '-2px',
                                            },
                                            children: title,
                                        },
                                    },
                                    {
                                        type: 'div',
                                        props: {
                                            style: {
                                                display: 'flex',
                                                justifyContent: 'flex-end',
                                                alignItems: 'center',
                                                gap: 16,
                                            },
                                            children: [
                                                {
                                                    type: 'div',
                                                    props: {
                                                        style: { width: 4, height: 32, background: '#ffffff' },
                                                    },
                                                },
                                                {
                                                    type: 'div',
                                                    props: {
                                                        style: { ...baseTextStyle, fontSize: 42, transform: 'translateY(-2px)' },
                                                        children: 'HYUNSEOK',
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
            }

            const pngBuffer = await deps.imageGenerator.generate(element as never, {
                width: 1200,
                height: 630,
                fonts,
            })

            return new Response(pngBuffer, {
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=2592000, immutable',
                },
            })
        }),
    )

    return route
}
