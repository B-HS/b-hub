import { describe, expect, test } from 'bun:test'
import { locationSchema, convertQuerySchema } from '../../../dto/weather/location'

describe('locationSchema', () => {
    test('올바른 위치 데이터를 파싱한다', () => {
        const result = locationSchema.parse({
            code: '1100000000',
            level1: '서울특별시',
            level2: '종로구',
            level3: '청운효자동',
            gridX: 60,
            gridY: 127,
            longitude: 126.97,
            latitude: 37.57,
        })
        expect(result.level1).toBe('서울특별시')
        expect(result.gridX).toBe(60)
    })

    test('level2, level3이 null이어도 유효하다', () => {
        const result = locationSchema.parse({
            code: '1100000000',
            level1: '서울특별시',
            level2: null,
            level3: null,
            gridX: 60,
            gridY: 127,
            longitude: 126.97,
            latitude: 37.57,
        })
        expect(result.level2).toBeNull()
    })

    test('필수 필드가 없으면 실패한다', () => {
        expect(() => locationSchema.parse({})).toThrow()
    })
})

describe('convertQuerySchema', () => {
    test('lat/lon으로 파싱한다', () => {
        const result = convertQuerySchema.parse({ lat: '37.57', lon: '126.97' })
        expect(result.lat).toBe(37.57)
        expect(result.lon).toBe(126.97)
    })

    test('gridX/gridY로 파싱한다', () => {
        const result = convertQuerySchema.parse({ gridX: '60', gridY: '127' })
        expect(result.gridX).toBe(60)
        expect(result.gridY).toBe(127)
    })

    test('빈 객체도 유효하다', () => {
        const result = convertQuerySchema.parse({})
        expect(result.lat).toBeUndefined()
    })
})
