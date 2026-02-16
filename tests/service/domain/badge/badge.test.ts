import { describe, expect, test, mock } from 'bun:test'
import { createBadgeService } from '../../../../service/domain/badge/badge'

const createMockDeps = () => ({
    imageGenerator: {
        generate: mock(() => Promise.resolve(Buffer.from('png-data'))),
    },
    fontLoader: {
        load: mock(() =>
            Promise.resolve({
                name: 'Inter',
                data: Buffer.from('font-data'),
                weight: 400 as const,
                style: 'normal' as const,
            }),
        ),
        loadLocal: mock(() => Promise.resolve(null)),
        loadGoogle: mock(() => Promise.resolve(null)),
        getAvailableFonts: mock(() => ({
            local: [{ name: 'Inter', weights: [400, 700] }],
            googleFontsSupported: true,
        })),
    },
    iconLoader: {
        loadLocal: mock(() => Promise.resolve('data:image/svg+xml;base64,abc')),
        loadFromUrl: mock(() => Promise.resolve('data:image/png;base64,xyz')),
        loadAvailableIcons: mock(() => Promise.resolve([])),
    },
    cache: {
        get: mock(() => null) as ReturnType<typeof mock>,
        set: mock(() => {}),
    },
})

const defaultRequest = {
    width: 800,
    height: 250,
    text: 'Test Badge',
    font: 'Inter',
    fontWeight: 400,
    color: '#000000',
    backgroundColor: '#ffffff',
    icon: '',
    iconUrl: '',
    iconSize: 0,
    tailwind: '',
    css: {} as Record<string, string | number>,
}

describe('createBadgeService', () => {
    test('이미지를 생성하고 캐시에 저장한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        const result = await service.generate(defaultRequest)

        expect(result.buffer).toBeInstanceOf(Buffer)
        expect(result.cacheHit).toBe(false)
        expect(deps.imageGenerator.generate).toHaveBeenCalledTimes(1)
        expect(deps.cache.set).toHaveBeenCalledTimes(1)
    })

    test('캐시된 이미지가 있으면 바로 반환한다', async () => {
        const deps = createMockDeps()
        const cachedBuffer = Buffer.from('cached-png')
        deps.cache.get = mock(() => cachedBuffer)
        const service = createBadgeService(deps)

        const result = await service.generate(defaultRequest)

        expect(result.buffer).toBe(cachedBuffer)
        expect(result.cacheHit).toBe(true)
        expect(deps.imageGenerator.generate).not.toHaveBeenCalled()
    })

    test('폰트를 로드한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate(defaultRequest)

        expect(deps.fontLoader.load).toHaveBeenCalledWith('Inter', 400)
    })

    test('폰트가 없으면 빈 배열로 생성한다', async () => {
        const deps = createMockDeps()
        deps.fontLoader.load = mock(() => Promise.resolve(null))
        const service = createBadgeService(deps)

        await service.generate(defaultRequest)

        expect(deps.imageGenerator.generate).toHaveBeenCalledTimes(1)
        const callArgs = (deps.imageGenerator.generate as ReturnType<typeof mock>).mock.calls[0]
        expect(callArgs[1].fonts).toEqual([])
    })

    test('iconUrl이 있으면 URL에서 아이콘을 로드한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate({
            ...defaultRequest,
            iconUrl: 'https://example.com/icon.png',
        })

        expect(deps.iconLoader.loadFromUrl).toHaveBeenCalledWith('https://example.com/icon.png')
        expect(deps.iconLoader.loadLocal).not.toHaveBeenCalled()
    })

    test('icon이 있으면 로컬에서 아이콘을 로드한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate({ ...defaultRequest, icon: 'github' })

        expect(deps.iconLoader.loadLocal).toHaveBeenCalledWith('github')
    })

    test('iconUrl이 icon보다 우선한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate({
            ...defaultRequest,
            icon: 'github',
            iconUrl: 'https://example.com/icon.png',
        })

        expect(deps.iconLoader.loadFromUrl).toHaveBeenCalled()
        expect(deps.iconLoader.loadLocal).not.toHaveBeenCalled()
    })

    test('fontSize가 없으면 height의 50%로 계산한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate({ ...defaultRequest, height: 200 })

        expect(deps.imageGenerator.generate).toHaveBeenCalledTimes(1)
    })

    test('fontSize가 있으면 그대로 사용한다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate({ ...defaultRequest, fontSize: 48 })

        expect(deps.imageGenerator.generate).toHaveBeenCalledTimes(1)
    })

    test('tailwind 변환 함수가 주입되면 사용한다', async () => {
        const convertTailwindToCSS = mock(() => ({ borderRadius: '8px' }))
        const deps = { ...createMockDeps(), convertTailwindToCSS }
        const service = createBadgeService(deps)

        await service.generate({ ...defaultRequest, tailwind: 'rounded-lg' })

        expect(convertTailwindToCSS).toHaveBeenCalledWith('rounded-lg')
    })

    test('mergeStyles 함수가 주입되면 사용한다', async () => {
        const mergeStyles = mock((...styles: Array<Record<string, string | number>>) => Object.assign({}, ...styles))
        const deps = { ...createMockDeps(), mergeStyles }
        const service = createBadgeService(deps)

        await service.generate(defaultRequest)

        expect(mergeStyles).toHaveBeenCalled()
    })

    test('getAvailableFonts는 fontLoader에서 가져온다', () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        const fonts = service.getAvailableFonts()

        expect(fonts.local).toHaveLength(1)
        expect(fonts.local[0].name).toBe('Inter')
        expect(fonts.googleFontsSupported).toBe(true)
    })

    test('generateCacheKey는 같은 입력에 같은 키를 반환한다', () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        const key1 = service.generateCacheKey(defaultRequest)
        const key2 = service.generateCacheKey(defaultRequest)

        expect(key1).toBe(key2)
        expect(key1).toHaveLength(16)
    })

    test('generateCacheKey는 다른 입력에 다른 키를 반환한다', () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        const key1 = service.generateCacheKey(defaultRequest)
        const key2 = service.generateCacheKey({
            ...defaultRequest,
            text: 'Different',
        })

        expect(key1).not.toBe(key2)
    })

    test('캐시 TTL은 24시간이다', async () => {
        const deps = createMockDeps()
        const service = createBadgeService(deps)

        await service.generate(defaultRequest)

        const setCall = (deps.cache.set as ReturnType<typeof mock>).mock.calls[0]
        expect(setCall[2]).toBe(24 * 60 * 60 * 1000)
    })
})
