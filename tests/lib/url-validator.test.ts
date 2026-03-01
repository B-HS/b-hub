import { describe, expect, test } from 'bun:test'
import { isPublicUrl, isAllowedRedirect } from '../../lib/url-validator'

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
        expect(isAllowedRedirect('https://hub.gumyo.net/callback')).toBe(true)
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

    test('javascript: 프로토콜을 거부한다', () => {
        expect(isAllowedRedirect('javascript:alert(1)')).toBe(false)
    })

    test('잘못된 URL을 거부한다', () => {
        expect(isAllowedRedirect('')).toBe(false)
        expect(isAllowedRedirect('not-a-url')).toBe(false)
    })
})
