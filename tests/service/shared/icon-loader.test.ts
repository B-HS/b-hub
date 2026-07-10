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

describe('icon-loader', () => {
    const loader = createIconLoader({ iconDir: TEST_ICON_DIR })

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
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never })
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
        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never })
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

        const loaderWithMock = createIconLoader({ iconDir: TEST_ICON_DIR, fetchFn: mockFetch as never })
        const result = await loaderWithMock.loadFromUrl('https://example.com/icon.svg')
        expect(result).not.toBeNull()

        const decoded = Buffer.from(result!.split(',')[1], 'base64').toString('utf-8')
        expect(decoded).not.toContain('<script')
    })
})
