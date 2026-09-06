import { describe, expect, test } from 'bun:test'
import { isPublicUrl, isPublicUrlResolved, isAllowedRedirect } from '../../lib/url-validator'

describe('isPublicUrl', () => {
    test('HTTPS public URL을 허용한다', () => {
        expect(isPublicUrl('https://example.com')).toBe(true)
        expect(isPublicUrl('https://discord.com/api/webhooks/123')).toBe(true)
        expect(isPublicUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true)
    })

    test('http:// URL을 거부한다', () => {
        expect(isPublicUrl('http://example.com')).toBe(false)
        expect(isPublicUrl('http://discord.com/webhook')).toBe(false)
    })

    test('127.x.x.x private IP를 거부한다', () => {
        expect(isPublicUrl('https://127.0.0.1')).toBe(false)
        expect(isPublicUrl('https://127.0.0.1:8080/path')).toBe(false)
        expect(isPublicUrl('https://127.255.255.255')).toBe(false)
    })

    test('10.x.x.x private IP를 거부한다', () => {
        expect(isPublicUrl('https://10.0.0.1')).toBe(false)
        expect(isPublicUrl('https://10.255.255.255')).toBe(false)
    })

    test('172.16-31.x.x private IP를 거부한다', () => {
        expect(isPublicUrl('https://172.16.0.1')).toBe(false)
        expect(isPublicUrl('https://172.31.255.255')).toBe(false)
        expect(isPublicUrl('https://172.20.10.1')).toBe(false)
    })

    test('172.16 범위 밖은 허용한다', () => {
        expect(isPublicUrl('https://172.15.0.1')).toBe(true)
        expect(isPublicUrl('https://172.32.0.1')).toBe(true)
    })

    test('192.168.x.x private IP를 거부한다', () => {
        expect(isPublicUrl('https://192.168.0.1')).toBe(false)
        expect(isPublicUrl('https://192.168.1.100')).toBe(false)
    })

    test('localhost를 거부한다', () => {
        expect(isPublicUrl('https://localhost')).toBe(false)
        expect(isPublicUrl('https://localhost:3000')).toBe(false)
    })

    test('0.0.0.0을 거부한다', () => {
        expect(isPublicUrl('https://0.0.0.0')).toBe(false)
    })

    test('::1 IPv6 loopback을 거부한다', () => {
        expect(isPublicUrl('https://[::1]')).toBe(false)
    })

    test('169.254.x.x link-local을 거부한다', () => {
        expect(isPublicUrl('https://169.254.1.1')).toBe(false)
    })

    test('잘못된 URL을 거부한다', () => {
        expect(isPublicUrl('not-a-url')).toBe(false)
        expect(isPublicUrl('')).toBe(false)
        expect(isPublicUrl('ftp://example.com')).toBe(false)
    })

    test('IPv4-mapped IPv6 주소를 거부한다', () => {
        expect(isPublicUrl('https://[::ffff:127.0.0.1]')).toBe(false)
        expect(isPublicUrl('https://[::ffff:169.254.169.254]')).toBe(false)
        expect(isPublicUrl('https://[::ffff:7f00:1]')).toBe(false)
        expect(isPublicUrl('https://[::ffff:a9fe:a9fe]')).toBe(false)
    })

    test('100.64/10 CGNAT 대역을 거부한다', () => {
        expect(isPublicUrl('https://100.64.0.1')).toBe(false)
        expect(isPublicUrl('https://100.127.255.255')).toBe(false)
        expect(isPublicUrl('https://100.63.0.1')).toBe(true)
        expect(isPublicUrl('https://100.128.0.1')).toBe(true)
    })

    test('멀티캐스트·브로드캐스트 주소를 거부한다', () => {
        expect(isPublicUrl('https://224.0.0.1')).toBe(false)
        expect(isPublicUrl('https://239.255.255.250')).toBe(false)
        expect(isPublicUrl('https://255.255.255.255')).toBe(false)
    })

    test('IPv6 링크로컬·멀티캐스트·ULA를 거부한다', () => {
        expect(isPublicUrl('https://[fe80::1]')).toBe(false)
        expect(isPublicUrl('https://[feb0::1]')).toBe(false)
        expect(isPublicUrl('https://[ff02::1]')).toBe(false)
        expect(isPublicUrl('https://[fd00::1]')).toBe(false)
        expect(isPublicUrl('https://[::]')).toBe(false)
    })
})

describe('isPublicUrlResolved', () => {
    test('공개 IP로 resolve되면 허용한다', async () => {
        const lookupFn = async () => [{ address: '93.184.216.34' }]
        expect(await isPublicUrlResolved('https://example.com/icon.png', lookupFn)).toBe(true)
    })

    test('내부 IP로 resolve되면 거부한다 (DNS rebinding 차단)', async () => {
        const lookupFn = async () => [{ address: '169.254.169.254' }]
        expect(await isPublicUrlResolved('https://rebind.example.com/icon.png', lookupFn)).toBe(false)
    })

    test('resolve 결과에 내부 IP가 하나라도 있으면 거부한다', async () => {
        const lookupFn = async () => [{ address: '93.184.216.34' }, { address: '::ffff:127.0.0.1' }]
        expect(await isPublicUrlResolved('https://mixed.example.com', lookupFn)).toBe(false)
    })

    test('resolve 실패나 빈 결과는 거부한다', async () => {
        const failing = async () => {
            throw new Error('ENOTFOUND')
        }
        expect(await isPublicUrlResolved('https://example.com', failing)).toBe(false)
        expect(await isPublicUrlResolved('https://example.com', async () => [])).toBe(false)
    })

    test('동기 검사에서 이미 막히는 URL은 resolve하지 않는다', async () => {
        let called = false
        const lookupFn = async () => {
            called = true
            return [{ address: '93.184.216.34' }]
        }
        expect(await isPublicUrlResolved('http://example.com', lookupFn)).toBe(false)
        expect(await isPublicUrlResolved('https://127.0.0.1', lookupFn)).toBe(false)
        expect(called).toBe(false)
    })
})

describe('isAllowedRedirect', () => {
    test('상대 경로를 허용한다', () => {
        expect(isAllowedRedirect('/')).toBe(true)
        expect(isAllowedRedirect('/dashboard')).toBe(true)
        expect(isAllowedRedirect('/settings/spotify')).toBe(true)
    })

    test('허용된 도메인을 허용한다', () => {
        expect(isAllowedRedirect('https://gumyo.net/dashboard')).toBe(true)
        expect(isAllowedRedirect('https://hyns.dev/settings')).toBe(true)
        expect(isAllowedRedirect('https://api.gumyo.net/callback')).toBe(true)
        expect(isAllowedRedirect('https://sub.hyns.dev')).toBe(true)
    })

    test('허용되지 않은 도메인을 거부한다', () => {
        expect(isAllowedRedirect('https://evil.com')).toBe(false)
        expect(isAllowedRedirect('https://evil.com/gumyo.net')).toBe(false)
        expect(isAllowedRedirect('https://gumyo.net.evil.com')).toBe(false)
    })

    test('protocol-relative URL을 거부한다', () => {
        expect(isAllowedRedirect('//evil.com')).toBe(false)
    })

    test('백슬래시 기반 protocol-relative URL을 거부한다', () => {
        expect(isAllowedRedirect('/\\evil.com')).toBe(false)
        expect(isAllowedRedirect('/\\/evil.com')).toBe(false)
        expect(isAllowedRedirect('\\\\evil.com')).toBe(false)
    })

    test('javascript: 프로토콜을 거부한다', () => {
        expect(isAllowedRedirect('javascript:alert(1)')).toBe(false)
    })

    test('잘못된 URL을 거부한다', () => {
        expect(isAllowedRedirect('')).toBe(false)
        expect(isAllowedRedirect('not-a-url')).toBe(false)
    })
})
