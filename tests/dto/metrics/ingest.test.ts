import { describe, expect, test } from 'bun:test'
import { metricsIngestBatchSchema, metricsIngestSchema } from '../../../dto/metrics/ingest'

describe('metricsIngestSchema', () => {
    test('deviceId와 payload만으로 파싱된다', () => {
        const result = metricsIngestSchema.parse({ deviceId: 'mac-1', payload: { cpu: { usage: 12.3 } } })
        expect(result.deviceId).toBe('mac-1')
        expect(result.payload.cpu).toEqual({ usage: 12.3 })
        expect(result.intervalSec).toBeUndefined()
    })

    test('메타 필드와 intervalSec coerce를 허용한다', () => {
        const result = metricsIngestSchema.parse({
            deviceId: 'esp32-1',
            hostname: 'esp32.local',
            os: 'esp-idf',
            arch: 'xtensa',
            agentVersion: 'fw@0.1.0',
            intervalSec: '60',
            payload: {},
        })
        expect(result.intervalSec).toBe(60)
    })

    test('deviceId가 없으면 실패한다', () => {
        expect(() => metricsIngestSchema.parse({ payload: {} })).toThrow()
    })

    test('deviceId 64자 초과는 실패한다', () => {
        expect(() => metricsIngestSchema.parse({ deviceId: 'a'.repeat(65), payload: {} })).toThrow()
    })

    test('payload가 객체가 아니면 실패한다', () => {
        expect(() => metricsIngestSchema.parse({ deviceId: 'x', payload: 'raw' })).toThrow()
    })
})

describe('metricsIngestBatchSchema', () => {
    test('빈 배열은 실패한다', () => {
        expect(() => metricsIngestBatchSchema.parse({ events: [] })).toThrow()
    })

    test('1건 이상이면 파싱된다', () => {
        const result = metricsIngestBatchSchema.parse({ events: [{ deviceId: 'x', payload: {} }] })
        expect(result.events).toHaveLength(1)
    })
})
