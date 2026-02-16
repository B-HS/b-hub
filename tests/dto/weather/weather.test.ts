import { describe, expect, test } from 'bun:test'
import { coordinatesQuerySchema, versionQuerySchema } from '../../../dto/weather/weather'

describe('coordinatesQuerySchema', () => {
    test('nx/ny로 파싱한다', () => {
        const result = coordinatesQuerySchema.parse({ nx: '60', ny: '127' })
        expect(result.nx).toBe(60)
        expect(result.ny).toBe(127)
    })

    test('location으로 파싱한다', () => {
        const result = coordinatesQuerySchema.parse({ location: '서울' })
        expect(result.location).toBe('서울')
    })

    test('빈 객체도 유효하다', () => {
        const result = coordinatesQuerySchema.parse({})
        expect(result.nx).toBeUndefined()
        expect(result.ny).toBeUndefined()
        expect(result.location).toBeUndefined()
    })

    test('nx 범위를 벗어나면 실패한다', () => {
        expect(() => coordinatesQuerySchema.parse({ nx: '0', ny: '1' })).toThrow()
        expect(() => coordinatesQuerySchema.parse({ nx: '150', ny: '1' })).toThrow()
    })

    test('ny 범위를 벗어나면 실패한다', () => {
        expect(() => coordinatesQuerySchema.parse({ nx: '1', ny: '0' })).toThrow()
        expect(() => coordinatesQuerySchema.parse({ nx: '1', ny: '254' })).toThrow()
    })
})

describe('versionQuerySchema', () => {
    test('유효한 ftype을 파싱한다', () => {
        expect(versionQuerySchema.parse({ ftype: 'ODAM' }).ftype).toBe('ODAM')
        expect(versionQuerySchema.parse({ ftype: 'VSRT' }).ftype).toBe('VSRT')
        expect(versionQuerySchema.parse({ ftype: 'SHRT' }).ftype).toBe('SHRT')
    })

    test('잘못된 ftype은 실패한다', () => {
        expect(() => versionQuerySchema.parse({ ftype: 'INVALID' })).toThrow()
    })

    test('ftype이 없으면 실패한다', () => {
        expect(() => versionQuerySchema.parse({})).toThrow()
    })
})
