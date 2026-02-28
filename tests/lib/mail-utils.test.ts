import { describe, expect, test } from 'bun:test'
import { sanitizeHeaderValue, sanitizeEmailName, escapeHtml, sanitizeFilename, isBlockedHost, maskProviderError } from '../../lib/mail-utils'

describe('sanitizeHeaderValue', () => {
    test('일반 문자열을 그대로 반환한다', () => {
        expect(sanitizeHeaderValue('Hello World')).toBe('Hello World')
    })

    test('\\r을 제거한다', () => {
        expect(sanitizeHeaderValue('Hello\rWorld')).toBe('HelloWorld')
    })

    test('\\n을 제거한다', () => {
        expect(sanitizeHeaderValue('Hello\nWorld')).toBe('HelloWorld')
    })

    test('\\r\\n을 제거한다', () => {
        expect(sanitizeHeaderValue('Hello\r\nWorld')).toBe('HelloWorld')
    })

    test('여러 CRLF를 모두 제거한다', () => {
        expect(sanitizeHeaderValue('A\r\nB\nC\rD')).toBe('ABCD')
    })

    test('빈 문자열을 처리한다', () => {
        expect(sanitizeHeaderValue('')).toBe('')
    })

    test('CRLF가 없는 문자열은 변경하지 않는다', () => {
        const subject = 'Re: Important Meeting <msg-id@example.com>'
        expect(sanitizeHeaderValue(subject)).toBe(subject)
    })

    test('헤더 인젝션 시도를 방어한다', () => {
        const malicious = 'Normal Subject\r\nBcc: attacker@evil.com'
        expect(sanitizeHeaderValue(malicious)).toBe('Normal SubjectBcc: attacker@evil.com')
    })

    test('null 바이트를 제거한다', () => {
        expect(sanitizeHeaderValue('Hello\x00World')).toBe('HelloWorld')
    })

    test('제어문자를 모두 제거한다', () => {
        expect(sanitizeHeaderValue('A\x01B\x1fC\x7fD')).toBe('ABCD')
    })
})

describe('sanitizeEmailName', () => {
    test('일반 이름을 그대로 반환한다', () => {
        expect(sanitizeEmailName('John Doe')).toBe('John Doe')
    })

    test('CRLF를 제거한다', () => {
        expect(sanitizeEmailName('John\r\nBcc: evil@hack.com')).toBe('JohnBcc: evil@hack.com')
    })

    test('쌍따옴표를 이스케이프한다', () => {
        expect(sanitizeEmailName('John "Johnny" Doe')).toBe('John \\"Johnny\\" Doe')
    })

    test('CRLF와 쌍따옴표를 동시에 처리한다', () => {
        expect(sanitizeEmailName('Evil"\r\nBcc: x@x.com')).toBe('Evil\\"Bcc: x@x.com')
    })

    test('빈 문자열을 처리한다', () => {
        expect(sanitizeEmailName('')).toBe('')
    })

    test('백슬래시를 이스케이프한다', () => {
        expect(sanitizeEmailName('John\\Doe')).toBe('John\\\\Doe')
    })

    test('백슬래시와 쌍따옴표를 동시에 처리한다', () => {
        expect(sanitizeEmailName('A\\"B')).toBe('A\\\\\\"B')
    })

    test('제어문자를 제거한다', () => {
        expect(sanitizeEmailName('Name\x00\x01Test')).toBe('NameTest')
    })

    test('256자를 초과하면 잘린다', () => {
        const long = 'A'.repeat(300)
        expect(sanitizeEmailName(long).length).toBe(256)
    })
})

describe('escapeHtml', () => {
    test('HTML 특수문자를 이스케이프한다', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
        )
    })

    test('앰퍼샌드를 이스케이프한다', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B')
    })

    test('작은따옴표를 이스케이프한다', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s')
    })

    test('일반 텍스트는 변경하지 않는다', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World')
    })

    test('빈 문자열을 처리한다', () => {
        expect(escapeHtml('')).toBe('')
    })
})

describe('sanitizeFilename', () => {
    test('일반 파일명을 그대로 반환한다', () => {
        expect(sanitizeFilename('document.pdf')).toBe('document.pdf')
    })

    test('경로 탐색 시퀀스를 제거한다', () => {
        expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    })

    test('슬래시로 구분된 경로에서 basename을 추출한다', () => {
        expect(sanitizeFilename('path/to/file.txt')).toBe('file.txt')
    })

    test('백슬래시로 구분된 경로에서 basename을 추출한다', () => {
        expect(sanitizeFilename('path\\to\\file.txt')).toBe('file.txt')
    })

    test('제어문자를 제거한다', () => {
        expect(sanitizeFilename('file\x00name.txt')).toBe('filename.txt')
    })

    test('빈 결과일 경우 file을 반환한다', () => {
        expect(sanitizeFilename('../../')).toBe('file')
    })

    test('공백만 남은 경우 file을 반환한다', () => {
        expect(sanitizeFilename('   ')).toBe('file')
    })

    test('다중 패스 우회를 방어한다 (....//)', () => {
        expect(sanitizeFilename('....//etc/passwd')).toBe('passwd')
    })

    test('URL 인코딩된 경로 탐색을 방어한다', () => {
        expect(sanitizeFilename('%2e%2e%2fetc%2fpasswd')).toBe('passwd')
    })

    test('이중 URL 인코딩은 단일 디코딩 후 안전하게 처리한다', () => {
        expect(sanitizeFilename('%252e%252e%252fpasswd')).toBe('%2e%2e%2fpasswd')
    })

    test('잘못된 퍼센트 인코딩이 있어도 에러 없이 처리한다', () => {
        expect(sanitizeFilename('file%zz.txt')).toBe('file%zz.txt')
    })

    test('잘못된 인코딩이 포함된 경로에서 basename을 추출한다', () => {
        expect(sanitizeFilename('path/file%zz.txt')).toBe('file%zz.txt')
    })

    test('쌍따옴표를 제거한다', () => {
        expect(sanitizeFilename('file"name".txt')).toBe('filename.txt')
    })

    test('255자 초과 파일명을 잘라낸다', () => {
        const long = 'a'.repeat(300) + '.txt'
        const result = sanitizeFilename(long)
        expect(result.length).toBe(255)
    })
})

describe('isBlockedHost', () => {
    test('localhost를 차단한다', () => {
        expect(isBlockedHost('localhost')).toBe(true)
    })

    test('127.0.0.1을 차단한다', () => {
        expect(isBlockedHost('127.0.0.1')).toBe(true)
    })

    test('127.x.x.x 대역을 차단한다', () => {
        expect(isBlockedHost('127.0.0.2')).toBe(true)
        expect(isBlockedHost('127.255.255.255')).toBe(true)
    })

    test('10.x.x.x 대역을 차단한다', () => {
        expect(isBlockedHost('10.0.0.1')).toBe(true)
        expect(isBlockedHost('10.255.255.255')).toBe(true)
    })

    test('172.16-31.x.x 대역을 차단한다', () => {
        expect(isBlockedHost('172.16.0.1')).toBe(true)
        expect(isBlockedHost('172.31.255.255')).toBe(true)
        expect(isBlockedHost('172.15.0.1')).toBe(false)
        expect(isBlockedHost('172.32.0.1')).toBe(false)
    })

    test('192.168.x.x 대역을 차단한다', () => {
        expect(isBlockedHost('192.168.0.1')).toBe(true)
        expect(isBlockedHost('192.168.1.100')).toBe(true)
    })

    test('169.254.x.x (link-local)를 차단한다', () => {
        expect(isBlockedHost('169.254.169.254')).toBe(true)
    })

    test('0.x.x.x 대역을 차단한다', () => {
        expect(isBlockedHost('0.0.0.0')).toBe(true)
    })

    test('metadata.google.internal을 차단한다', () => {
        expect(isBlockedHost('metadata.google.internal')).toBe(true)
    })

    test('IPv6 loopback ::1을 차단한다', () => {
        expect(isBlockedHost('::1')).toBe(true)
        expect(isBlockedHost('[::1]')).toBe(true)
    })

    test('IPv6 link-local을 차단한다', () => {
        expect(isBlockedHost('fe80::1')).toBe(true)
    })

    test('IPv6 ULA를 차단한다', () => {
        expect(isBlockedHost('fc00::1')).toBe(true)
        expect(isBlockedHost('fd00::1')).toBe(true)
    })

    test('공개 호스트를 허용한다', () => {
        expect(isBlockedHost('imap.gmail.com')).toBe(false)
        expect(isBlockedHost('smtp.naver.com')).toBe(false)
        expect(isBlockedHost('8.8.8.8')).toBe(false)
    })

    test('대소문자를 무시한다', () => {
        expect(isBlockedHost('LOCALHOST')).toBe(true)
        expect(isBlockedHost('Metadata.Google.Internal')).toBe(true)
    })
})

describe('maskProviderError', () => {
    test('IP 주소를 마스킹한다', () => {
        expect(maskProviderError('Connection to 192.168.1.1:993 failed')).toBe('Connection to [redacted]:993 failed')
    })

    test('여러 IP를 모두 마스킹한다', () => {
        expect(maskProviderError('from 10.0.0.1 to 172.16.0.1')).toBe('from [redacted] to [redacted]')
    })

    test('internal 호스트명을 마스킹한다', () => {
        expect(maskProviderError('server.internal refused')).toBe('[redacted] refused')
    })

    test('일반 에러 메시지는 변경하지 않는다', () => {
        expect(maskProviderError('Authentication failed')).toBe('Authentication failed')
    })

    test('빈 문자열을 처리한다', () => {
        expect(maskProviderError('')).toBe('')
    })
})
