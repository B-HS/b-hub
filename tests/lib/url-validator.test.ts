import { describe, expect, test } from 'bun:test'
import { isPublicUrl } from '../../lib/url-validator'

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
