import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { createIconLoader } from '../../../service/shared/icon-loader'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'

const TEST_ICON_DIR = join(import.meta.dir, '__test_icons__')

beforeAll(() => {
    mkdirSync(TEST_ICON_DIR, { recursive: true })
    writeFileSync(
        join(TEST_ICON_DIR, 'test.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24"/></svg>',
    )
    writeFileSync(join(TEST_ICON_DIR, 'test.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    writeFileSync(
        join(TEST_ICON_DIR, 'malicious.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="24" height="24"/></svg>',
    )
})

afterAll(() => {
    try {
        rmSync(TEST_ICON_DIR, { recursive: true, force: true })
    } catch {}
})

const publicLookup = async () => [{ address: '93.184.216.34' }]

describe('icon-loader', () => {
    const loader = createIconLoader({ iconDir: TEST_ICON_DIR, lookupFn: publicLookup })

    test('loadLocal: 유효한 SVG 아이콘 → data URL', async () => {
        const result = await loader.loadLocal('test')
        expect(result).toStartWith('data:image/svg+xml;base64,')
    })

    test('loadLocal: 존재하지 않는 아이콘 → null', async () => {
        const result = await loader.loadLocal('nonexistent')
        expect(result).toBeNull()
    })

    test('loadLocal: 특수문자 포함 이름 → null', async () => {
        const result = await loader.loadLocal('../etc/passwd')
        expect(result).toBeNull()
    })

    test('loadLocal: 점(.) 포함 이름 → null', async () => {
        const result = await loader.loadLocal('test.svg')
        expect(result).toBeNull()
    })

    test('loadLocal: 빈 문자열 → null', async () => {
        const result = await loader.loadLocal('')
        expect(result).toBeNull()
    })

    test('loadFromUrl: private URL → null', async () => {
        const result = await loader.loadFromUrl('http://localhost:8080/icon.svg')
        expect(result).toBeNull()
    })

    test('loadFromUrl: private IP → null', async () => {
        const result = await loader.loadFromUrl('https://192.168.1.1/icon.svg')
        expect(result).toBeNull()
    })

    test('loadFromUrl: 잘못된 URL → null', async () => {
        const result = await loader.loadFromUrl('not-a-url')
        expect(result).toBeNull()
    })

    test('loadFromUrl: 내부 주소로 리다이렉트 → null (SSRF 차단)', async () => {
        const mockFetch = async (target: string | URL) => {
            if (target.toString() === 'https://example.com/redir.png') {
                return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })
            }
            return new Response('should-not-be-reached', { headers: { 'content-type': 'image/png' } })
        }
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })
        const result = await loaderWithMock.loadFromUrl('https://example.com/redir.png')
        expect(result).toBeNull()
    })

    test('loadFromUrl: 공개 URL 간 리다이렉트는 따라간다', async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24"/></svg>'
        const mockFetch = async (target: string | URL) => {
            if (target.toString() === 'https://example.com/start.svg') {
                return new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/final.svg' } })
            }
            return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } })
        }
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })
        const result = await loaderWithMock.loadFromUrl('https://example.com/start.svg')
        expect(result).toStartWith('data:image/svg+xml;base64,')
    })

    test('loadAvailableIcons: 테스트 디렉토리의 아이콘 목록 반환', async () => {
        const icons = await loader.loadAvailableIcons()
        expect(icons).toContain('test')
        expect(icons).toContain('malicious')
    })

    test('SVG sanitization: script 태그 제거', async () => {
        const mockFetch = async () =>
            new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect/></svg>', {
                headers: { 'content-type': 'image/svg+xml' },
            })

        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })
        const result = await loaderWithMock.loadFromUrl('https://example.com/icon.svg')
        expect(result).not.toBeNull()

        const decoded = Buffer.from(result!.split(',')[1], 'base64').toString('utf-8')
        expect(decoded).not.toContain('<script')
    })

    test('loadFromUrl: DNS가 내부 IP로 resolve되면 fetch하지 않는다', async () => {
        let fetched = false
        const mockFetch = async () => {
            fetched = true
            return new Response('x', { headers: { 'content-type': 'image/png' } })
        }
        const loaderWithMock = createIconLoader({
            iconDir: TEST_ICON_DIR,
            fetchFn: mockFetch as never,
            lookupFn: async () => [{ address: '169.254.169.254' }],
        })

        expect(await loaderWithMock.loadFromUrl('https://rebind.example.com/icon.png')).toBeNull()
        expect(fetched).toBe(false)
    })

    test('loadFromUrl: 허용되지 않은 MIME(text/html) → null', async () => {
        const mockFetch = async () => new Response('<html><body>not an icon</body></html>', { headers: { 'content-type': 'text/html' } })
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        expect(await loaderWithMock.loadFromUrl('https://example.com/icon.html')).toBeNull()
    })

    test('loadFromUrl: parseICO 없이 ICO → null', async () => {
        const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
        const mockFetch = async () => new Response(ico, { headers: { 'content-type': 'image/x-icon' } })
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        expect(await loaderWithMock.loadFromUrl('https://example.com/favicon.ico')).toBeNull()
    })

    test('loadFromUrl: content-length가 상한을 넘으면 null', async () => {
        const mockFetch = async () =>
            new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
                headers: { 'content-type': 'image/png', 'content-length': String(5 * 1024 * 1024) },
            })
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        expect(await loaderWithMock.loadFromUrl('https://example.com/huge.png')).toBeNull()
    })

    test('loadFromUrl: 실제 본문이 상한을 넘으면 null', async () => {
        const oversized = new Uint8Array(3 * 1024 * 1024)
        oversized.set([0x89, 0x50, 0x4e, 0x47], 0)
        const mockFetch = async () => new Response(oversized, { headers: { 'content-type': 'image/png' } })
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        expect(await loaderWithMock.loadFromUrl('https://example.com/oversized.png')).toBeNull()
    })

    test('loadFromUrl: 본문 다운로드까지 취소 시그널을 유지한다', async () => {
        const receivedSignals: Array<AbortSignal | null | undefined> = []
        const mockFetch = async (_target: string | URL, init?: RequestInit) => {
            receivedSignals.push(init?.signal)
            return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { 'content-type': 'image/png' } })
        }
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        const result = await loaderWithMock.loadFromUrl('https://example.com/ok.png')
        expect(result).toStartWith('data:image/png;base64,')
        expect(receivedSignals[0]).toBeInstanceOf(AbortSignal)
        expect(receivedSignals[0]?.aborted).toBe(false)
    })

    test('loadFromUrl: webp 아이콘 → data URL', async () => {
        const webp = new Uint8Array(16)
        webp.set(Buffer.from('RIFF'), 0)
        webp.set(Buffer.from('WEBP'), 8)
        const mockFetch = async () => new Response(webp, { headers: { 'content-type': 'image/webp' } })
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never, lookupFn: publicLookup })

        expect(await loaderWithMock.loadFromUrl('https://example.com/icon.webp')).toStartWith('data:image/webp;base64,')
    })

    test('loadFromUrl: 실패한 URL은 재요청·DNS 조회를 하지 않는다', async () => {
        let fetchCount = 0
        let lookupCount = 0
        const mockFetch = async () => {
            fetchCount += 1
            return new Response('nope', { status: 404 })
        }
        const loaderWithMock = createIconLoader({
            iconDir: TEST_ICON_DIR,
            fetchFn: mockFetch as never,
            lookupFn: async () => {
                lookupCount += 1
                return [{ address: '93.184.216.34' }]
            },
        })

        expect(await loaderWithMock.loadFromUrl('https://example.com/missing.png')).toBeNull()
        expect(await loaderWithMock.loadFromUrl('https://example.com/missing.png')).toBeNull()
        expect(fetchCount).toBe(1)
        expect(lookupCount).toBe(1)
    })
})
