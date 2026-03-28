import { describe, expect, test } from 'bun:test'
import {
    splitAddresses,
    parseEmailAddress,
    getHeader,
    decodeBase64Url,
    getBody,
    getAttachments,
} from '../../../../../service/domain/mail/providers/gmail-helpers'

describe('splitAddresses', () => {
    test('단일 주소를 반환한다', () => {
        expect(splitAddresses('user@example.com')).toEqual(['user@example.com'])
    })

    test('여러 주소를 분리한다', () => {
        expect(splitAddresses('a@test.com, b@test.com, c@test.com')).toEqual(['a@test.com', 'b@test.com', 'c@test.com'])
    })

    test('따옴표 안의 쉼표를 무시한다', () => {
        expect(splitAddresses('"Last, First" <a@test.com>, b@test.com')).toEqual(['"Last, First" <a@test.com>', 'b@test.com'])
    })

    test('꺾쇠괄호 안의 쉼표를 무시한다', () => {
        expect(splitAddresses('Name <a@test.com>, Other <b@test.com>')).toEqual(['Name <a@test.com>', 'Other <b@test.com>'])
    })

    test('빈 문자열은 빈 배열을 반환한다', () => {
        expect(splitAddresses('')).toEqual([])
    })

    test('공백만 있는 문자열은 빈 배열을 반환한다', () => {
        expect(splitAddresses('   ')).toEqual([])
    })

    test('주소 사이 공백을 trim한다', () => {
        expect(splitAddresses('  a@test.com ,  b@test.com  ')).toEqual(['a@test.com', 'b@test.com'])
    })
})

describe('parseEmailAddress', () => {
    test('Name <email> 형식을 파싱한다', () => {
        expect(parseEmailAddress('John Doe <john@example.com>')).toEqual([{ name: 'John Doe', address: 'john@example.com' }])
    })

    test('"Name" <email> 형식을 파싱한다', () => {
        expect(parseEmailAddress('"John Doe" <john@example.com>')).toEqual([{ name: 'John Doe', address: 'john@example.com' }])
    })

    test('bare email을 파싱한다', () => {
        expect(parseEmailAddress('john@example.com')).toEqual([{ name: '', address: 'john@example.com' }])
    })

    test('빈 문자열은 빈 배열을 반환한다', () => {
        expect(parseEmailAddress('')).toEqual([])
    })

    test('5000자 초과 헤더는 빈 배열을 반환한다 (ReDoS 방어)', () => {
        const longHeader = 'a'.repeat(5001)
        expect(parseEmailAddress(longHeader)).toEqual([])
    })

    test('5000자 이하 헤더는 정상 파싱한다', () => {
        const header = `${'a'.repeat(4980)} <test@test.com>`
        const result = parseEmailAddress(header)
        expect(result).toHaveLength(1)
        expect(result[0].address).toBe('test@test.com')
    })

    test('여러 수신자를 파싱한다', () => {
        const result = parseEmailAddress('Alice <a@test.com>, Bob <b@test.com>')
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ name: 'Alice', address: 'a@test.com' })
        expect(result[1]).toEqual({ name: 'Bob', address: 'b@test.com' })
    })

    test('이름 없는 <email> 형식을 파싱한다', () => {
        expect(parseEmailAddress('<user@test.com>')).toEqual([{ name: '', address: 'user@test.com' }])
    })

    test('특수문자가 포함된 이름을 파싱한다', () => {
        const result = parseEmailAddress('"O\'Brien, James" <james@test.com>')
        expect(result[0].address).toBe('james@test.com')
        expect(result[0].name).toBe("O'Brien, James")
    })

    test('잘못된 형식은 원본을 address로 반환한다', () => {
        expect(parseEmailAddress('not-an-email')).toEqual([{ name: '', address: 'not-an-email' }])
    })

    test('따옴표 안 쉼표가 포함된 이름을 파싱한다', () => {
        const result = parseEmailAddress('"Last, First" <user@test.com>')
        expect(result).toEqual([{ name: 'Last, First', address: 'user@test.com' }])
    })
})

describe('getHeader', () => {
    const headers = [
        { name: 'Subject', value: 'Hello' },
        { name: 'From', value: 'test@example.com' },
        { name: 'Content-Type', value: 'text/html' },
    ]

    test('헤더를 찾는다', () => {
        expect(getHeader(headers, 'Subject')).toBe('Hello')
    })

    test('대소문자를 무시한다', () => {
        expect(getHeader(headers, 'subject')).toBe('Hello')
        expect(getHeader(headers, 'SUBJECT')).toBe('Hello')
        expect(getHeader(headers, 'content-type')).toBe('text/html')
    })

    test('없는 헤더는 빈 문자열을 반환한다', () => {
        expect(getHeader(headers, 'X-Custom')).toBe('')
    })

    test('빈 헤더 배열은 빈 문자열을 반환한다', () => {
        expect(getHeader([], 'Subject')).toBe('')
    })
})

describe('decodeBase64Url', () => {
    test('base64url을 UTF-8로 디코딩한다', () => {
        const encoded = Buffer.from('Hello, World!').toString('base64url')
        expect(decodeBase64Url(encoded)).toBe('Hello, World!')
    })

    test('-를 +로, _를 /로 치환하여 디코딩한다', () => {
        const text = 'subjects?with+special/chars'
        const base64url = Buffer.from(text).toString('base64url')
        expect(decodeBase64Url(base64url)).toBe(text)
    })

    test('한글을 디코딩한다', () => {
        const encoded = Buffer.from('안녕하세요').toString('base64url')
        expect(decodeBase64Url(encoded)).toBe('안녕하세요')
    })

    test('빈 문자열을 디코딩한다', () => {
        expect(decodeBase64Url('')).toBe('')
    })

    test('잘못된 base64 데이터도 crash하지 않는다', () => {
        const result = decodeBase64Url('!!!invalid!!!')
        expect(typeof result).toBe('string')
    })
})

describe('getBody', () => {
    test('text/html 본문을 추출한다', () => {
        const payload = {
            mimeType: 'text/html',
            body: { data: Buffer.from('<h1>Hello</h1>').toString('base64url') },
        }
        const result = getBody(payload)
        expect(result.html).toBe('<h1>Hello</h1>')
        expect(result.text).toBeNull()
    })

    test('text/plain 본문을 추출한다', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Hello').toString('base64url') },
        }
        const result = getBody(payload)
        expect(result.text).toBe('Hello')
        expect(result.html).toBeNull()
    })

    test('둘 다 있는 multipart를 추출한다', () => {
        const payload = {
            mimeType: 'multipart/alternative',
            body: {},
            parts: [
                { mimeType: 'text/plain', body: { data: Buffer.from('Plain text').toString('base64url') } },
                { mimeType: 'text/html', body: { data: Buffer.from('<p>HTML</p>').toString('base64url') } },
            ],
        }
        const result = getBody(payload)
        expect(result.html).toBe('<p>HTML</p>')
        expect(result.text).toBe('Plain text')
    })

    test('중첩 multipart를 재귀 탐색한다', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
                {
                    mimeType: 'multipart/alternative',
                    body: {},
                    parts: [
                        { mimeType: 'text/plain', body: { data: Buffer.from('Nested plain').toString('base64url') } },
                        { mimeType: 'text/html', body: { data: Buffer.from('<p>Nested</p>').toString('base64url') } },
                    ],
                },
            ],
        }
        const result = getBody(payload)
        expect(result.html).toBe('<p>Nested</p>')
        expect(result.text).toBe('Nested plain')
    })

    test('본문이 없으면 null을 반환한다', () => {
        const payload = { mimeType: 'multipart/mixed', body: {}, parts: [] }
        const result = getBody(payload)
        expect(result.html).toBeNull()
        expect(result.text).toBeNull()
    })
})

describe('getAttachments', () => {
    test('첨부파일을 추출한다', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
                { mimeType: 'text/html', body: { data: 'abc' } },
                {
                    mimeType: 'application/pdf',
                    filename: 'doc.pdf',
                    body: { attachmentId: 'att-1', size: 1024 },
                    headers: [],
                },
            ],
        }
        const result = getAttachments(payload)
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
            id: 'att-1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            contentId: '',
            isInline: false,
        })
    })

    test('inline 첨부파일을 식별한다', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
                {
                    mimeType: 'image/png',
                    filename: 'logo.png',
                    body: { attachmentId: 'att-2', size: 512 },
                    headers: [{ name: 'Content-Id', value: '<logo-cid>' }],
                },
            ],
        }
        const result = getAttachments(payload)
        expect(result).toHaveLength(1)
        expect(result[0].contentId).toBe('logo-cid')
        expect(result[0].isInline).toBe(true)
    })

    test('Content-Id에서 꺾쇠를 제거한다', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
                {
                    mimeType: 'image/jpeg',
                    filename: 'photo.jpg',
                    body: { attachmentId: 'att-3', size: 256 },
                    headers: [{ name: 'Content-Id', value: '<image001@example>' }],
                },
            ],
        }
        const result = getAttachments(payload)
        expect(result[0].contentId).toBe('image001@example')
    })

    test('첨부파일이 없으면 빈 배열을 반환한다', () => {
        const payload = {
            mimeType: 'text/html',
            body: { data: 'abc' },
        }
        expect(getAttachments(payload)).toEqual([])
    })

    test('filename이 없으면 null', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
                {
                    mimeType: 'application/octet-stream',
                    filename: '',
                    body: { attachmentId: 'att-4', size: 100 },
                    headers: [],
                },
            ],
        }
        const result = getAttachments(payload)
        expect(result[0].filename).toBeNull()
    })
})
