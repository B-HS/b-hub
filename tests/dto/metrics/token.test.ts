import { describe, expect, test } from 'bun:test'
import { metricsTokenCreateSchema } from '../../../dto/metrics/token'

describe('metricsTokenCreateSchema', () => {
    test('scope 기본값은 client다', () => {
        const result = metricsTokenCreateSchema.parse({ alias: 'demo-mbp' })
        expect(result.scope).toBe('client')
        expect(result.expiresInDays).toBeUndefined()
        expect(result.dailyLimit).toBeUndefined()
    })

    test('admin scope와 숫자 문자열 coerce를 허용한다', () => {
        const result = metricsTokenCreateSchema.parse({ alias: 'dash', scope: 'admin', expiresInDays: '30', dailyLimit: '5000' })
        expect(result.scope).toBe('admin')
        expect(result.expiresInDays).toBe(30)
        expect(result.dailyLimit).toBe(5000)
    })

    test('alias가 비면 실패한다', () => {
        expect(() => metricsTokenCreateSchema.parse({ alias: '' })).toThrow()
    })

    test('알 수 없는 scope는 실패한다', () => {
        expect(() => metricsTokenCreateSchema.parse({ alias: 'x', scope: 'root' })).toThrow()
    })

    test('expiresInDays 상한(3650)을 초과하면 실패한다', () => {
        expect(() => metricsTokenCreateSchema.parse({ alias: 'x', expiresInDays: 3651 })).toThrow()
    })
})
