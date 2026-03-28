import { describe, expect, test, mock } from 'bun:test'
import { createSpotifyWidgetService, DEFAULT_THEME } from '../../../../service/domain/spotify/spotify-widget'
import { createCache } from '../../../../service/shared/cache'

const mockTrack = {
    name: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    albumArt: null as string | null,
    externalUrl: 'https://open.spotify.com/track/123' as string | null,
    durationMs: 200000,
    progressMs: 50000 as number | null,
}

type NowPlayingResult = {
    isPlaying: boolean
    track: typeof mockTrack | null
    lastPlayedAt: string | null
}

const createMockDeps = () => ({
    spotifyDataService: {
        getNowPlaying: mock(() =>
            Promise.resolve<NowPlayingResult>({
                isPlaying: true,
                track: mockTrack,
                lastPlayedAt: null,
            }),
        ),
        getPlaylists: mock(() => Promise.resolve({ items: [], total: 0, limit: 20, offset: 0 })),
    },
    albumArtCache: createCache<string>({ maxSize: 10, defaultTtlMs: 60000 }),
})

describe('createSpotifyWidgetService', () => {
    test('generateSvg가 재생 중인 곡의 SVG를 생성한다', async () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const svg = await service.generateSvg(1)
        expect(svg).toContain('<svg')
        expect(svg).toContain('Test Song')
        expect(svg).toContain('Test Artist')
        expect(svg).toContain('Now Playing')
    })

    test('generateSvg가 미재생 시 Not Playing SVG를 반환한다', async () => {
        const deps = createMockDeps()
        deps.spotifyDataService.getNowPlaying = mock(() => Promise.resolve({ isPlaying: false, track: null, lastPlayedAt: null }))
        const service = createSpotifyWidgetService(deps)
        const svg = await service.generateSvg(1)
        expect(svg).toContain('Not Playing')
    })

    test('generateSvg가 미재생 시 마지막 곡 대신 Not Playing을 표시한다', async () => {
        const deps = createMockDeps()
        deps.spotifyDataService.getNowPlaying = mock(() =>
            Promise.resolve({
                isPlaying: false,
                track: { ...mockTrack, progressMs: null },
                lastPlayedAt: '2024-01-01T00:00:00Z',
            }),
        )
        const service = createSpotifyWidgetService(deps)
        const svg = await service.generateSvg(1)
        expect(svg).toContain('Not Playing')
        expect(svg).not.toContain('Test Song')
    })

    test('generateSvg가 긴 곡명을 truncate한다', async () => {
        const deps = createMockDeps()
        deps.spotifyDataService.getNowPlaying = mock(() =>
            Promise.resolve({
                isPlaying: true,
                track: { ...mockTrack, name: 'A'.repeat(50) },
                lastPlayedAt: null,
            }),
        )
        const service = createSpotifyWidgetService(deps)
        const svg = await service.generateSvg(1)
        expect(svg).toContain('...')
    })

    test('generateHtmlWidget가 HTML 문서를 반환한다', () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const html = service.generateHtmlWidget('abc123', 'https://hub.gumyo.net')
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('https://hub.gumyo.net/api/spotify/playing/abc123/data')
    })

    test('getNowPlayingData가 spotify data 서비스를 호출한다', async () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const data = await service.getNowPlayingData(1)
        expect(data.isPlaying).toBe(true)
        expect(data.track?.name).toBe('Test Song')
        expect(deps.spotifyDataService.getNowPlaying).toHaveBeenCalledWith(1)
    })

    test('generateSvg가 앨범명을 표시한다', async () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const svg = await service.generateSvg(1)
        expect(svg).toContain('Test Album')
        expect(svg).not.toContain('progress')
    })

    test('generateSvg가 커스텀 테마를 적용한다', async () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const theme = { ...DEFAULT_THEME, bg: '000000', color: 'ff0000', accent: '00ff00', radius: 0 }
        const svg = await service.generateSvg(1, theme)
        expect(svg).toContain('fill="#000000"')
        expect(svg).toContain('fill: #ff0000')
        expect(svg).toContain('fill="#00ff00"')
        expect(svg).toContain('rx="0"')
    })

    test('generateHtmlWidget가 커스텀 테마를 적용한다', () => {
        const deps = createMockDeps()
        const service = createSpotifyWidgetService(deps)
        const theme = { ...DEFAULT_THEME, bg: '222222', accent: 'ff5500', radius: 20 }
        const html = service.generateHtmlWidget('abc123', 'https://hub.gumyo.net', theme)
        expect(html).toContain('#222222')
        expect(html).toContain('#ff5500')
        expect(html).toContain('20px')
    })
})
