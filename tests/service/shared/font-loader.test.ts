import { describe, expect, test, mock } from 'bun:test'
import { createFontLoader } from '../../../service/shared/font-loader'

const createMockFetchFn = (cssContent = '', fontBuffer = new ArrayBuffer(8)) =>
    mock((url: string) => {
        if (url.includes('fonts.googleapis.com')) {
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(cssContent),
            } as Response)
        }
        return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(fontBuffer),
        } as Response)
    })

describe('createFontLoader', () => {
    describe('loadGoogle', () => {
        test('CSS에서 font URL을 추출하고 폰트를 로드한다', async () => {
            const css = `@font-face { src: url('https://fonts.gstatic.com/s/inter/v1/inter.woff2') format('woff2'); }`
            const fetchFn = createMockFetchFn(css)
            const loader = createFontLoader({ fetchFn })

            const result = await loader.loadGoogle('Inter', 400)
            expect(result).not.toBeNull()
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })

        test('CSS 요청 실패 시 null을 반환한다', async () => {
            const fetchFn = mock(() =>
                Promise.resolve({
                    ok: false,
                    text: () => Promise.resolve(''),
                } as Response),
            )
            const loader = createFontLoader({ fetchFn })

            const result = await loader.loadGoogle('Inter', 400)
            expect(result).toBeNull()
        })

        test('CSS에 URL이 없으면 null을 반환한다', async () => {
            const fetchFn = createMockFetchFn('@font-face { font-family: Inter; }')
            const loader = createFontLoader({ fetchFn })

            const result = await loader.loadGoogle('Inter', 400)
            expect(result).toBeNull()
        })

        test('캐시된 폰트를 재사용한다', async () => {
            const css = `@font-face { src: url('https://fonts.gstatic.com/s/inter/v1/inter.woff2') format('woff2'); }`
            const fetchFn = createMockFetchFn(css)
            const loader = createFontLoader({ fetchFn })

            await loader.loadGoogle('Inter', 400)
            await loader.loadGoogle('Inter', 400)
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })

        test('Google 폰트 요청에 타임아웃 시그널을 붙인다', async () => {
            const css = `@font-face { src: url('https://fonts.gstatic.com/s/inter/v1/inter.woff2') format('woff2'); }`
            const signals: Array<AbortSignal | null | undefined> = []
            const fetchFn = mock((url: string, init?: RequestInit) => {
                signals.push(init?.signal)
                if (url.includes('fonts.googleapis.com')) {
                    return Promise.resolve({ ok: true, text: () => Promise.resolve(css) } as Response)
                }
                return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Response)
            })
            const loader = createFontLoader({ fetchFn })

            await loader.loadGoogle('Inter', 400)
            expect(signals).toHaveLength(2)
            expect(signals[0]).toBeInstanceOf(AbortSignal)
            expect(signals[1]).toBeInstanceOf(AbortSignal)
        })

        test('네트워크 에러 시 null을 반환한다', async () => {
            const fetchFn = mock(() => Promise.reject(new Error('Network error')))
            const loader = createFontLoader({ fetchFn })

            const result = await loader.loadGoogle('Inter', 400)
            expect(result).toBeNull()
        })

        test('실패한 폰트는 다음 요청에서 다시 시도한다', async () => {
            const fetchFn = mock(() => Promise.reject(new Error('Network error')))
            const loader = createFontLoader({ fetchFn })

            expect(await loader.loadGoogle('CustomFont', 400)).toBeNull()
            expect(await loader.loadGoogle('CustomFont', 400)).toBeNull()
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })
    })

    describe('load', () => {
        test('로컬 실패 시 Google Fonts를 시도한다', async () => {
            const css = `@font-face { src: url('https://fonts.gstatic.com/s/custom/v1/custom.woff2') format('woff2'); }`
            const fetchFn = createMockFetchFn(css)
            const loader = createFontLoader({ fetchFn })

            const result = await loader.load('CustomFont', 400)
            expect(result).not.toBeNull()
            if (result) {
                expect(result.source).toBe('google')
                expect(result.name).toBe('CustomFont')
            }
        })

        test('Google도 실패하면 Inter로 폴백한다', async () => {
            const fetchFn = mock(() => Promise.resolve({ ok: false } as Response))
            const loader = createFontLoader({ fetchFn })

            const result = await loader.load('UnknownFont', 400)
            if (result) {
                expect(result.name).toBe('Inter')
                expect(result.source).toBe('local')
            }
        })
    })

    describe('getAvailableFonts', () => {
        test('로컬 폰트 목록과 Google 지원 여부를 반환한다', () => {
            const loader = createFontLoader()
            const fonts = loader.getAvailableFonts()

            expect(fonts.googleFontsSupported).toBe(true)
            expect(fonts.local).toBeArray()
            expect(fonts.local.length).toBeGreaterThan(0)
            expect(fonts.local[0]).toHaveProperty('name')
            expect(fonts.local[0]).toHaveProperty('weights')
        })
    })
})

describe('loadLocal 실패 기록', () => {
    test('로컬 폰트 읽기가 실패하면 captureException 으로 기록하고 null 을 반환한다', async () => {
        const realFsPromises = await import('fs/promises')
        const captured: unknown[] = []
        mock.module('../../../lib/sentry', () => ({
            captureException: (error: unknown) => captured.push(error),
            initSentry: () => {},
        }))
        mock.module('fs/promises', () => ({ ...realFsPromises, readFile: () => Promise.reject(new Error('ENOENT')) }))

        const { createFontLoader: createLoader } = await import('../../../service/shared/font-loader')
        const loader = createLoader()

        const result = await loader.loadLocal('Inter', 400)

        mock.module('fs/promises', () => realFsPromises)

        expect(result).toBeNull()
        expect(captured).toHaveLength(1)
        expect((captured[0] as Error).message).toBe('ENOENT')
    })
})
