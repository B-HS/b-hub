import { describe, expect, test } from 'bun:test'
import { decodeJwtPayloadUnverified, getJwtExpiryMs } from '../../lib/jwt-decode'

const base64url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url')

const buildJwt = (payload: Record<string, unknown>) => `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.sig`

describe('decodeJwtPayloadUnverified', () => {
    test('정상 JWT의 payload를 디코드한다', () => {
        const payload = { sub: 'user-123', name: '김테스트', exp: 1700000000 }
        const result = decodeJwtPayloadUnverified(buildJwt(payload))
        expect(result).toEqual(payload)
    })

    test('점이 없는 문자열은 null을 반환한다', () => {
        expect(decodeJwtPayloadUnverified('not-a-jwt')).toBeNull()
    })

    test('payload가 유효한 JSON이 아니면 null을 반환한다', () => {
        const broken = `${base64url({ alg: 'none' })}.${Buffer.from('{not json', 'utf-8').toString('base64url')}.sig`
        expect(decodeJwtPayloadUnverified(broken)).toBeNull()
    })

    test('payload가 객체가 아닌 원시값이면 null을 반환한다', () => {
        const numeric = `${base64url({ alg: 'none' })}.${Buffer.from('5', 'utf-8').toString('base64url')}.sig`
        expect(decodeJwtPayloadUnverified(numeric)).toBeNull()
    })

    test('base64url(- _) 문자가 포함된 payload도 디코드한다', () => {
        let payload: Record<string, unknown> = {}
        let segment = ''
        for (let i = 1; i < 200; i++) {
            payload = { data: '>'.repeat(i) + '?'.repeat(i) }
            segment = base64url(payload)
            if (segment.includes('-') && segment.includes('_')) break
        }
        expect(segment).toMatch(/[-_]/)
        const token = `${base64url({ alg: 'none' })}.${segment}.sig`
        expect(decodeJwtPayloadUnverified(token)).toEqual(payload)
    })
})

describe('getJwtExpiryMs', () => {
    test('exp 클레임을 밀리초로 변환한다', () => {
        const expSec = 1_700_000_000
        expect(getJwtExpiryMs(buildJwt({ exp: expSec }))).toBe(expSec * 1000)
    })

    test('exp가 없으면 null을 반환한다', () => {
        expect(getJwtExpiryMs(buildJwt({ sub: 'x' }))).toBeNull()
    })

    test('exp가 숫자가 아니면 null을 반환한다', () => {
        expect(getJwtExpiryMs(buildJwt({ exp: '1700000000' }))).toBeNull()
    })

    test('잘못된 JWT면 null을 반환한다', () => {
        expect(getJwtExpiryMs('garbage')).toBeNull()
    })
})
