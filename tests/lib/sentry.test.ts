import { describe, expect, test } from 'bun:test'
import { initSentry, captureException } from '../../lib/sentry'

describe('initSentry', () => {
    test('DSN이 없으면 에러 없이 실행된다', () => {
        expect(() => initSentry(undefined)).not.toThrow()
    })

    test('DSN이 빈 문자열이면 에러 없이 실행된다', () => {
        expect(() => initSentry('')).not.toThrow()
    })

    test('잘못된 DSN이어도 에러를 던지지 않는다', () => {
        expect(() => initSentry('invalid-dsn')).not.toThrow()
    })
})

describe('captureException', () => {
    test('초기화 전이어도 에러를 던지지 않는다', () => {
        expect(() => captureException(new Error('test'))).not.toThrow()
    })

    test('문자열 에러도 처리한다', () => {
        expect(() => captureException('string error')).not.toThrow()
    })
})

describe('initSentry 재호출', () => {
    test('여러 번 호출해도 에러를 던지지 않는다', () => {
        expect(() => {
            initSentry(undefined)
            initSentry('invalid-dsn')
            initSentry(undefined)
        }).not.toThrow()
    })
})

describe('부트스트랩 배선', () => {
    test('index.ts가 compose() 이전에 initSentry(getEnv().SENTRY_DSN)를 호출한다', async () => {
        const source = await Bun.file(new URL('../../index.ts', import.meta.url)).text()
        const initIndex = source.indexOf('initSentry(getEnv().SENTRY_DSN)')
        const composeIndex = source.indexOf('compose()')

        expect(initIndex).toBeGreaterThan(-1)
        expect(composeIndex).toBeGreaterThan(-1)
        expect(initIndex).toBeLessThan(composeIndex)
    })
})
