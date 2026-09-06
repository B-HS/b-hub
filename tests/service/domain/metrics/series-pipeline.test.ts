import { describe, expect, test } from 'bun:test'
import { buildSeriesPipeline } from '../../../../compose/metrics'
import type { MetricsSeriesQuery } from '../../../../dto/metrics/query'

const seriesQuery = (overrides: Partial<MetricsSeriesQuery> = {}): MetricsSeriesQuery => ({
    deviceId: 'mac-1',
    field: 'cpu.usage',
    limit: 500,
    ...overrides,
})

const projectionValue = (params: MetricsSeriesQuery) => {
    const stage = buildSeriesPipeline(params)[3] as { $project: { v: unknown } }
    return stage.$project.v
}

const getField = (value: unknown, key: string) =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined

const resolvePath = (path: string, doc: Record<string, unknown>, vars: Record<string, unknown>) => {
    if (path.startsWith('$$')) {
        const [name, ...rest] = path.slice(2).split('.')
        return rest.reduce(getField, vars[name])
    }
    return path.slice(1).split('.').reduce<unknown>(getField, doc)
}

const evaluate = (expr: unknown, doc: Record<string, unknown>, vars: Record<string, unknown> = {}): unknown => {
    if (typeof expr === 'string') return resolvePath(expr, doc, vars)
    const node = expr as Record<string, unknown>
    if (node.$let) {
        const { vars: letVars, in: body } = node.$let as { vars: Record<string, unknown>; in: unknown }
        const bound = Object.fromEntries(Object.entries(letVars).map(([name, value]) => [name, evaluate(value, doc, vars)]))
        return evaluate(body, doc, { ...vars, ...bound })
    }
    if (node.$cond) {
        const [condition, whenTrue, whenFalse] = node.$cond as [unknown, unknown, unknown]
        return evaluate(condition, doc, vars) ? evaluate(whenTrue, doc, vars) : evaluate(whenFalse, doc, vars)
    }
    if (node.$isArray) return Array.isArray(evaluate(node.$isArray, doc, vars))
    if (node.$arrayElemAt) {
        const [input, index] = node.$arrayElemAt as [unknown, number]
        const array = evaluate(input, doc, vars)
        return Array.isArray(array) ? array[index] : undefined
    }
    return undefined
}

const sampleDoc = {
    payload: {
        cpu: { usage: 12.5, cores: [{ usage: 3.5 }, { usage: 7 }] },
        network: {
            interfaces: [
                { name: 'en0', rx_delta: 10 },
                { name: 'en1', rx_delta: 20 },
            ],
        },
        legacy: { '0': { usage: 99 } },
    },
}

describe('buildSeriesPipeline', () => {
    test('match·sort·limit 스테이지는 기존 계약을 유지한다', () => {
        const from = new Date('2026-09-01T00:00:00Z')
        const to = new Date('2026-09-02T00:00:00Z')
        const pipeline = buildSeriesPipeline(seriesQuery({ from, to, limit: 30 }))
        expect(pipeline[0]).toEqual({
            $match: { 'deviceId': 'mac-1', 'payload.cpu.usage': { $type: 'number' }, 'receivedAt': { $gte: from, $lte: to } },
        })
        expect(pipeline[1]).toEqual({ $sort: { receivedAt: -1 } })
        expect(pipeline[2]).toEqual({ $limit: 30 })
    })

    test('from·to가 없으면 match에 receivedAt이 없다', () => {
        const [match] = buildSeriesPipeline(seriesQuery())
        expect(match).toEqual({ $match: { 'deviceId': 'mac-1', 'payload.cpu.usage': { $type: 'number' } } })
    })

    test('숫자 세그먼트가 없으면 v는 단순 payload 경로다', () => {
        expect(buildSeriesPipeline(seriesQuery())[3]).toEqual({ $project: { _id: 0, t: '$receivedAt', v: '$payload.cpu.usage' } })
    })

    test('배열 인덱스 경로는 $arrayElemAt으로 해석된다', () => {
        expect(projectionValue(seriesQuery({ field: 'cpu.cores.0.usage' }))).toEqual({
            $let: {
                vars: {
                    e0: {
                        $cond: [{ $isArray: '$payload.cpu.cores' }, { $arrayElemAt: ['$payload.cpu.cores', 0] }, '$payload.cpu.cores.0'],
                    },
                },
                in: '$$e0.usage',
            },
        })
    })

    test('배열 인덱스 경로가 실제 문서에서 숫자로 평가된다', () => {
        expect(evaluate(projectionValue(seriesQuery({ field: 'cpu.cores.0.usage' })), sampleDoc)).toBe(3.5)
        expect(evaluate(projectionValue(seriesQuery({ field: 'cpu.cores.1.usage' })), sampleDoc)).toBe(7)
        expect(evaluate(projectionValue(seriesQuery({ field: 'network.interfaces.1.rx_delta' })), sampleDoc)).toBe(20)
    })

    test('숫자 세그먼트가 없는 경로도 실제 문서에서 그대로 평가된다', () => {
        expect(evaluate(projectionValue(seriesQuery({ field: 'cpu.usage' })), sampleDoc)).toBe(12.5)
    })

    test('배열이 아니라 숫자 키를 가진 객체면 필드 접근으로 평가된다', () => {
        expect(evaluate(projectionValue(seriesQuery({ field: 'legacy.0.usage' })), sampleDoc)).toBe(99)
    })

    test('숫자 세그먼트가 여러 개면 중첩 $let으로 해석된다', () => {
        const doc = { payload: { grid: [[{ v: 1 }, { v: 2 }]] } }
        expect(evaluate(projectionValue(seriesQuery({ field: 'grid.0.1.v' })), doc)).toBe(2)
    })

    test('마지막 세그먼트가 숫자여도 인덱스로 해석된다', () => {
        const doc = { payload: { load: [0.1, 0.5, 0.9] } }
        expect(evaluate(projectionValue(seriesQuery({ field: 'load.2' })), doc)).toBe(0.9)
    })
})
