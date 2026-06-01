import { describe, expect, test } from 'bun:test'
import { serviceNameFromPath, severityFromStatus, errorCodeFromStatus } from '../../lib/log-service-name'

describe('serviceNameFromPath', () => {
    test.each([
        ['/api/weather/current', 'b-hub-weather'],
        ['/api/mail/messages', 'b-hub-mail'],
        ['/api/spotify/playing', 'b-hub-spotify'],
        ['/api/logs', 'b-hub-logs'],
        ['/api/unknown', 'b-hub-api'],
        ['/policy', 'b-hub-web'],
    ])('%s -> %s', (path, expected) => {
        expect(serviceNameFromPath(path)).toBe(expected)
    })
})

describe('severityFromStatus', () => {
    test('5xx는 ERROR(40)', () => expect(severityFromStatus(500)).toBe(40))
    test('4xx는 WARN(30)', () => expect(severityFromStatus(404)).toBe(30))
})

describe('errorCodeFromStatus', () => {
    test('404 -> NOT_FOUND', () => expect(errorCodeFromStatus(404)).toBe('NOT_FOUND'))
    test('429 -> RATE_LIMIT_EXCEEDED', () => expect(errorCodeFromStatus(429)).toBe('RATE_LIMIT_EXCEEDED'))
    test('500 -> INTERNAL_ERROR', () => expect(errorCodeFromStatus(500)).toBe('INTERNAL_ERROR'))
    test('418 -> HTTP_418', () => expect(errorCodeFromStatus(418)).toBe('HTTP_418'))
})
