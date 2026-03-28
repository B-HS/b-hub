import { describe, expect, test, mock } from 'bun:test'
import { createContentParser } from '../../../../service/domain/hn/hn-content-parser'
import * as cheerio from 'cheerio'

const createMockResponse = (body: string, opts: { ok?: boolean; status?: number; statusText?: string; contentType?: string } = {}) => {
    const { ok = true, status = 200, statusText = 'OK', contentType = 'text/html' } = opts
    return {
        ok,
        status,
        statusText,
        headers: new Headers({ 'content-type': contentType }),
        text: () => Promise.resolve(body),
    } as Response
}

const longContent = 'a'.repeat(150)

describe('createContentParser', () => {
    describe('parse', () => {
        test('article 태그에서 콘텐츠를 추출한다', async () => {
            const html = `<html><body><article>${longContent}</article><main>main text</main></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
            expect(result.content).toContain('a'.repeat(100))
        })

        test('article이 없으면 main 태그에서 추출한다', async () => {
            const html = `<html><body><main>${longContent}</main></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
            expect(result.content).toBeDefined()
        })

        test('article과 main이 없으면 body에서 추출한다', async () => {
            const html = `<html><body><div>${longContent}</div></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
        })

        test('script, nav, footer 등 불필요한 요소를 제거한다', async () => {
            const html = `<html><body><article>${longContent}<script>alert(1)</script><nav>nav</nav><footer>footer</footer></article></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
            expect(result.content).not.toContain('alert')
            expect(result.content).not.toContain('nav')
            expect(result.content).not.toContain('footer')
        })

        test('공백을 정규화한다', async () => {
            const html = `<html><body><article>hello     world    ${'x'.repeat(100)}</article></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
            expect(result.content).not.toContain('     ')
        })

        test('100자 미만 콘텐츠는 실패를 반환한다', async () => {
            const html = `<html><body><article>short</article></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html)))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to extract meaningful content')
        })

        test('HTTP 에러 응답 시 실패를 반환한다', async () => {
            const fetchFn = mock(() => Promise.resolve(createMockResponse('', { ok: false, status: 404, statusText: 'Not Found' })))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toContain('HTTP 404')
        })

        test('지원하지 않는 content-type은 실패를 반환한다', async () => {
            const fetchFn = mock(() => Promise.resolve(createMockResponse('', { contentType: 'application/pdf' })))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toContain('Unsupported content type')
        })

        test('text/html content-type을 정상 처���한다', async () => {
            const html = `<html><body><article>${longContent}</article></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html, { contentType: 'text/html; charset=utf-8' })))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
        })

        test('application/xhtml content-type을 정상 처리한다', async () => {
            const html = `<html><body><article>${longContent}</article></body></html>`
            const fetchFn = mock(() => Promise.resolve(createMockResponse(html, { contentType: 'application/xhtml+xml' })))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(true)
        })

        test('네트워크 에러 시 에러 메시지를 반환한다', async () => {
            const fetchFn = mock(() => Promise.reject(new Error('ECONNREFUSED')))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toBe('ECONNREFUSED')
        })

        test('AbortError 시 Request timeout을 반환한다', async () => {
            const abortError = new DOMException('The operation was aborted', 'AbortError')
            const fetchFn = mock(() => Promise.reject(abortError))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toBe('Request timeout')
        })

        test('Error가 아닌 예외를 문자열로 처리한다', async () => {
            const fetchFn = mock(() => Promise.reject('string error'))
            const parser = createContentParser({ cheerio, fetchFn })

            const result = await parser.parse('https://example.com')
            expect(result.success).toBe(false)
            expect(result.error).toBe('string error')
        })
    })
})
