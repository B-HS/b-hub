import { describe, expect, test, mock } from 'bun:test'
import { createSpotifyDataService } from '../../../../service/domain/spotify/spotify-data'

const createMockProvider = (overrides = {}) => ({
    spotifyFetch: mock(() => Promise.resolve(new Response())),
    getCurrentlyPlaying: mock(() => Promise.resolve(null)),
    getRecentlyPlayed: mock(() => Promise.resolve({ items: [] })),
    getPlaylists: mock(() => Promise.resolve({ items: [], total: 0, limit: 20, offset: 0 })),
    disconnect: mock(() => {}),
    ...overrides,
})

describe('createSpotifyDataService', () => {
    describe('getNowPlaying', () => {
        test('재생 중일 때 트랙 정보를 반환한다', async () => {
            const provider = createMockProvider({
                getCurrentlyPlaying: mock(() =>
                    Promise.resolve({
                        is_playing: true,
                        progress_ms: 30000,
                        item: {
                            name: 'Bohemian Rhapsody',
                            artists: [{ name: 'Queen' }],
                            album: { name: 'A Night at the Opera', images: [{ url: 'https://img.com/album.jpg' }] },
                            external_urls: { spotify: 'https://open.spotify.com/track/123' },
                            duration_ms: 354000,
                        },
                    }),
                ),
            })

            const service = createSpotifyDataService({
                createProvider: mock(() => Promise.resolve(provider)),
            })

            const result = await service.getNowPlaying(1)
            expect(result.isPlaying).toBe(true)
            expect(result.track?.name).toBe('Bohemian Rhapsody')
            expect(result.track?.artist).toBe('Queen')
            expect(result.track?.album).toBe('A Night at the Opera')
            expect(result.track?.progressMs).toBe(30000)
        })

        test('미재생 시 최근 재생 정보를 반환한다', async () => {
            const provider = createMockProvider({
                getCurrentlyPlaying: mock(() => Promise.resolve(null)),
                getRecentlyPlayed: mock(() =>
                    Promise.resolve({
                        items: [
                            {
                                track: {
                                    name: 'Yesterday',
                                    artists: [{ name: 'The Beatles' }],
                                    album: { name: 'Help!', images: [] },
                                    external_urls: {},
                                    duration_ms: 125000,
                                },
                                played_at: '2024-01-01T12:00:00Z',
                            },
                        ],
                    }),
                ),
            })

            const service = createSpotifyDataService({
                createProvider: mock(() => Promise.resolve(provider)),
            })

            const result = await service.getNowPlaying(1)
            expect(result.isPlaying).toBe(false)
            expect(result.track?.name).toBe('Yesterday')
            expect(result.lastPlayedAt).toBe('2024-01-01T12:00:00Z')
        })

        test('isPlaying 플래그가 올바르다', async () => {
            const provider = createMockProvider({
                getCurrentlyPlaying: mock(() =>
                    Promise.resolve({ is_playing: false, item: null }),
                ),
                getRecentlyPlayed: mock(() => Promise.resolve({ items: [] })),
            })

            const service = createSpotifyDataService({
                createProvider: mock(() => Promise.resolve(provider)),
            })

            const result = await service.getNowPlaying(1)
            expect(result.isPlaying).toBe(false)
            expect(result.track).toBeNull()
        })
    })

    describe('getPlaylists', () => {
        test('플레이리스트 목록을 정규화하여 반환한다', async () => {
            const provider = createMockProvider({
                getPlaylists: mock(() =>
                    Promise.resolve({
                        items: [
                            {
                                id: 'pl-1',
                                name: 'My Playlist',
                                description: 'Great songs',
                                images: [{ url: 'https://img.com/pl.jpg' }],
                                tracks: { total: 42 },
                                public: true,
                                external_urls: { spotify: 'https://open.spotify.com/playlist/pl-1' },
                            },
                        ],
                        total: 1,
                        limit: 20,
                        offset: 0,
                    }),
                ),
            })

            const service = createSpotifyDataService({
                createProvider: mock(() => Promise.resolve(provider)),
            })

            const result = await service.getPlaylists(1, 20, 0)
            expect(result.items).toHaveLength(1)
            expect(result.items[0].name).toBe('My Playlist')
            expect(result.items[0].trackCount).toBe(42)
            expect(result.total).toBe(1)
        })

        test('limit, offset을 전달한다', async () => {
            const provider = createMockProvider()
            const service = createSpotifyDataService({
                createProvider: mock(() => Promise.resolve(provider)),
            })

            await service.getPlaylists(1, 10, 5)
            expect(provider.getPlaylists).toHaveBeenCalledWith(10, 5)
        })
    })
})
