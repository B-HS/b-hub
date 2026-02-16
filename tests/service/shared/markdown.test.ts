import { describe, expect, test } from 'bun:test'
import { createMarkdownService } from '../../../service/shared/markdown'

describe('createMarkdownService', () => {
    const md = createMarkdownService()

    describe('toHtml', () => {
        test('헤딩을 변환한다', async () => {
            const result = await md.toHtml('# Title')
            expect(result).toContain('<h1>Title</h1>')
        })

        test('볼드를 변환한다', async () => {
            const result = await md.toHtml('**bold**')
            expect(result).toContain('<strong>bold</strong>')
        })

        test('이탤릭을 변환한다', async () => {
            const result = await md.toHtml('*italic*')
            expect(result).toContain('<em>italic</em>')
        })

        test('인라인 코드를 변환한다', async () => {
            const result = await md.toHtml('`code`')
            expect(result).toContain('<code>code</code>')
        })

        test('링크를 변환한다', async () => {
            const result = await md.toHtml('[link](https://example.com)')
            expect(result).toContain('<a href="https://example.com">link</a>')
        })

        test('javascript: 링크를 차단한다', async () => {
            const result = await md.toHtml('[Click](javascript:alert(1))')
            expect(result).not.toContain('javascript:')
            expect(result).toContain('#blocked')
        })

        test('data: 링크를 차단한다', async () => {
            const result = await md.toHtml('[Click](data:text/html,<script>alert(1)</script>)')
            expect(result).not.toContain('data:text')
            expect(result).toContain('#blocked')
        })
    })

    describe('sanitizeHtml', () => {
        test('script 태그를 제거한다', () => {
            const result = md.sanitizeHtml('<p>text</p><script>alert("xss")</script>')
            expect(result).not.toContain('script')
            expect(result).toContain('<p>text</p>')
        })

        test('on이벤트 속성을 제거한다', () => {
            const result = md.sanitizeHtml('<div onclick="alert(1)">text</div>')
            expect(result).not.toContain('onclick')
        })

        test('작은따옴표 on이벤트 속성을 제거한다', () => {
            const result = md.sanitizeHtml("<img onerror='alert(1)' src='x'>")
            expect(result).not.toContain('onerror')
        })

        test('iframe 태그를 제거한다', () => {
            const result = md.sanitizeHtml('<p>text</p><iframe src="https://evil.com"></iframe>')
            expect(result).not.toContain('iframe')
        })

        test('svg 태그를 제거한다', () => {
            const result = md.sanitizeHtml('<svg onload="alert(1)"><circle r="10"/></svg>')
            expect(result).not.toContain('svg')
        })

        test('embed/object 태그를 제거한다', () => {
            const result = md.sanitizeHtml('<embed src="evil.swf"><object data="evil.swf"></object>')
            expect(result).not.toContain('embed')
            expect(result).not.toContain('object')
        })

        test('javascript: href를 차단한다', () => {
            const result = md.sanitizeHtml('<a href="javascript:alert(1)">click</a>')
            expect(result).not.toContain('javascript:')
        })

        test('data: href를 차단한다', () => {
            const result = md.sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>')
            expect(result).not.toContain('data:')
        })
    })

    describe('stripHtml', () => {
        test('HTML 태그를 제거한다', () => {
            expect(md.stripHtml('<p><strong>bold</strong> text</p>')).toBe('bold text')
        })

        test('빈 문자열을 처리한다', () => {
            expect(md.stripHtml('')).toBe('')
        })
    })

    describe('truncate', () => {
        test('짧은 텍스트는 그대로 반환한다', () => {
            expect(md.truncate('short', 200)).toBe('short')
        })

        test('긴 텍스트를 잘라서 ...을 붙인다', () => {
            const long = 'a'.repeat(300)
            const result = md.truncate(long, 200)
            expect(result.length).toBe(203)
            expect(result.endsWith('...')).toBe(true)
        })

        test('기본 maxLength는 200이다', () => {
            const long = 'a'.repeat(300)
            const result = md.truncate(long)
            expect(result.length).toBe(203)
        })
    })
})
