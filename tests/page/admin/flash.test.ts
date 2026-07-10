import { describe, expect, test } from 'bun:test'
import { FLASH_ERROR_MESSAGE, flashPath, parseFlash } from '../../../page/admin/flash'

const queryContext = (params: Record<string, string>) => ({
    req: { query: (key: string) => params[key] },
})

describe('parseFlash', () => {
    test('flash=ok 이면 기본 성공 메시지를 반환한다', () => {
        expect(parseFlash(queryContext({ flash: 'ok' }))).toEqual({ kind: 'ok', message: '저장되었습니다.' })
    })

    test('okMessage 를 넘기면 성공 메시지를 대체한다', () => {
        expect(parseFlash(queryContext({ flash: 'ok' }), '해소 처리되었습니다.')).toEqual({ kind: 'ok', message: '해소 처리되었습니다.' })
    })

    test('flash=err 에 code 가 있으면 매핑된 구체 메시지를 반환한다', () => {
        expect(parseFlash(queryContext({ flash: 'err', code: 'sync' }))).toEqual({ kind: 'err', message: FLASH_ERROR_MESSAGE.sync })
    })

    test('알 수 없는 code 는 기본 실패 메시지로 폴백한다', () => {
        expect(parseFlash(queryContext({ flash: 'err', code: 'nope' }))).toEqual({ kind: 'err', message: '작업에 실패했습니다.' })
    })

    test('flash 가 없으면 null 을 반환한다', () => {
        expect(parseFlash(queryContext({}))).toBeNull()
    })
})

describe('flashPath', () => {
    test('쿼리가 없으면 ? 로 flash 를 붙인다', () => {
        expect(flashPath('/admin/users')).toBe('/admin/users?flash=ok')
    })

    test('쿼리가 있으면 & 로 flash 를 붙인다', () => {
        expect(flashPath('/admin/users?page=2')).toBe('/admin/users?page=2&flash=ok')
    })

    test('err 와 code 를 함께 직렬화한다', () => {
        expect(flashPath('/admin/mail/accounts', 'err', 'sync')).toBe('/admin/mail/accounts?flash=err&code=sync')
    })

    test('code 가 없으면 err 만 붙인다', () => {
        expect(flashPath('/admin/mail/accounts', 'err')).toBe('/admin/mail/accounts?flash=err')
    })
})
