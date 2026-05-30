import { describe, expect, test } from 'bun:test'
import {
    clampPage,
    formatBytes,
    formatDate,
    formatDateShort,
    maskToken,
    parseDateEnd,
    parseDateStart,
    parseIntOr,
    truncate,
    ynLabel,
} from '../../../page/admin/format'

describe('formatDate', () => {
    test('Date 객체를 ISO 형식으로 포맷한다', () => {
        const d = new Date('2026-05-25T12:34:56.000Z')
        expect(formatDate(d)).toBe('2026-05-25 12:34:56')
    })

    test('null/undefined는 - 을 반환한다', () => {
        expect(formatDate(null)).toBe('-')
        expect(formatDate(undefined)).toBe('-')
    })

    test('invalid date는 - 을 반환한다', () => {
        expect(formatDate('not-a-date')).toBe('-')
    })
})

describe('formatDateShort', () => {
    test('YYYY-MM-DD만 반환한다', () => {
        expect(formatDateShort(new Date('2026-05-25T12:00:00.000Z'))).toBe('2026-05-25')
    })
})

describe('formatBytes', () => {
    test('0을 0 B로 반환한다', () => {
        expect(formatBytes(0)).toBe('0 B')
    })

    test('KB 단위로 변환한다 (10 미만은 소수 1자리)', () => {
        expect(formatBytes(2048)).toBe('2.0 KB')
    })

    test('MB 단위로 변환한다 (10 미만은 소수 1자리)', () => {
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    })

    test('10 이상은 정수로 반올림한다', () => {
        expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB')
    })

    test('GB 단위로 변환한다', () => {
        expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
    })

    test('null은 -를 반환한다', () => {
        expect(formatBytes(null)).toBe('-')
    })
})

describe('maskToken', () => {
    test('긴 토큰을 양 끝만 표시한다', () => {
        expect(maskToken('abcdefghij1234567890')).toBe('abcd…7890')
    })

    test('짧은 토큰은 prefix***로 표시한다', () => {
        expect(maskToken('abc')).toBe('ab***')
    })

    test('null은 -를 반환한다', () => {
        expect(maskToken(null)).toBe('-')
    })
})

describe('truncate', () => {
    test('지정 길이 이하면 원본 그대로 반환한다', () => {
        expect(truncate('hello', 10)).toBe('hello')
    })

    test('초과하면 …를 붙인다', () => {
        expect(truncate('1234567890', 5)).toBe('12345…')
    })

    test('null은 - 을 반환한다', () => {
        expect(truncate(null)).toBe('-')
    })
})

describe('parseIntOr', () => {
    test('정상 정수를 그대로 반환한다', () => {
        expect(parseIntOr('42', 0)).toBe(42)
    })

    test('파싱 실패 시 fallback을 반환한다', () => {
        expect(parseIntOr('abc', 7)).toBe(7)
        expect(parseIntOr(undefined, 3)).toBe(3)
    })

    test('소수는 fallback을 반환한다', () => {
        expect(parseIntOr('3.14', 1)).toBe(1)
    })
})

describe('ynLabel', () => {
    test('boolean을 YES/NO로 변환한다', () => {
        expect(ynLabel(true)).toBe('YES')
        expect(ynLabel(false)).toBe('NO')
        expect(ynLabel(null)).toBe('NO')
    })
})

describe('clampPage', () => {
    test('범위 내 값은 그대로 반환한다', () => {
        expect(clampPage(3, 10)).toBe(3)
    })

    test('1 미만은 1로 보정한다', () => {
        expect(clampPage(0, 10)).toBe(1)
        expect(clampPage(-5, 10)).toBe(1)
    })

    test('totalPages 초과는 totalPages로 보정한다', () => {
        expect(clampPage(20, 10)).toBe(10)
    })

    test('totalPages가 0이면 1로 처리한다', () => {
        expect(clampPage(1, 0)).toBe(1)
    })
})

describe('parseDateStart', () => {
    test('빈 값은 undefined를 반환한다', () => {
        expect(parseDateStart(undefined)).toBeUndefined()
        expect(parseDateStart('')).toBeUndefined()
    })

    test('YYYY-MM-DD는 그 날의 0시로 파싱한다', () => {
        const d = parseDateStart('2026-05-25')
        expect(d).toBeInstanceOf(Date)
        expect(d?.getHours()).toBe(0)
        expect(d?.getMinutes()).toBe(0)
    })

    test('잘못된 날짜는 undefined를 반환한다', () => {
        expect(parseDateStart('not-a-date')).toBeUndefined()
    })
})

describe('parseDateEnd', () => {
    test('빈 값은 undefined를 반환한다', () => {
        expect(parseDateEnd(undefined)).toBeUndefined()
    })

    test('YYYY-MM-DD는 그 날의 끝(23:59:59)으로 파싱한다', () => {
        const d = parseDateEnd('2026-05-25')
        expect(d).toBeInstanceOf(Date)
        expect(d?.getHours()).toBe(23)
        expect(d?.getMinutes()).toBe(59)
    })

    test('잘못된 날짜는 undefined를 반환한다', () => {
        expect(parseDateEnd('xyz')).toBeUndefined()
    })
})
