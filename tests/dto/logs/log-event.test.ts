import { describe, expect, test } from 'bun:test'
import { logEventIngestSchema, logEventBatchSchema, logEventListQuerySchema, SEVERITY } from '../../../dto/logs/log-event'

describe('logEventIngestSchema', () => {
    test('유효한 이벤트를 파싱한다', () => {
        const r = logEventIngestSchema.parse({ service: 'esp32-weather', errorCode: 'ESP_WIFI_DOWN', severity: 'ERROR' })
        expect(r.service).toBe('esp32-weather')
        expect(r.severity).toBe(SEVERITY.ERROR)
    })

    test('service가 없으면 실패한다', () => {
        expect(() => logEventIngestSchema.parse({ errorCode: 'X' })).toThrow()
    })

    test('errorCode가 없으면 실패한다', () => {
        expect(() => logEventIngestSchema.parse({ service: 'x' })).toThrow()
    })

    test('severity 미지정 시 기본값 INFO(20)', () => {
        const r = logEventIngestSchema.parse({ service: 'x', errorCode: 'y' })
        expect(r.severity).toBe(20)
    })

    test('severity 숫자를 그대로 받는다', () => {
        const r = logEventIngestSchema.parse({ service: 'x', errorCode: 'y', severity: 40 })
        expect(r.severity).toBe(40)
    })

    test('severity 이름을 숫자로 변환한다', () => {
        const r = logEventIngestSchema.parse({ service: 'x', errorCode: 'y', severity: 'WARN' })
        expect(r.severity).toBe(30)
    })
})

describe('logEventBatchSchema', () => {
    test('빈 배열은 실패한다', () => {
        expect(() => logEventBatchSchema.parse({ events: [] })).toThrow()
    })

    test('이벤트 배열을 파싱한다', () => {
        const r = logEventBatchSchema.parse({ events: [{ service: 'x', errorCode: 'y' }] })
        expect(r.events).toHaveLength(1)
    })
})

describe('logEventListQuerySchema', () => {
    test('기본값(limit 100, offset 0)으로 파싱한다', () => {
        const r = logEventListQuerySchema.parse({})
        expect(r.limit).toBe(100)
        expect(r.offset).toBe(0)
    })

    test('limit 최대값(500)을 초과하면 실패한다', () => {
        expect(() => logEventListQuerySchema.parse({ limit: '501' })).toThrow()
    })

    test('severityGte 문자열을 숫자로 강제 변환한다', () => {
        const r = logEventListQuerySchema.parse({ severityGte: '40' })
        expect(r.severityGte).toBe(40)
    })

    test('unresolved=true를 boolean true로 변환한다', () => {
        const r = logEventListQuerySchema.parse({ unresolved: 'true' })
        expect(r.unresolved).toBe(true)
    })

    test('unresolved 미지정 시 false', () => {
        const r = logEventListQuerySchema.parse({})
        expect(r.unresolved).toBe(false)
    })
})
