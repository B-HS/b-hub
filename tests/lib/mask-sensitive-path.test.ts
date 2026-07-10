import { describe, expect, test } from 'bun:test'
import { maskSensitivePath } from '../../lib/mask-sensitive-path'

describe('maskSensitivePath', () => {
    test('caldav 토큰 세그먼트를 마스킹한다', () => {
        expect(maskSensitivePath('/caldav/super-secret-token')).toBe('/caldav/[REDACTED]')
    })

    test('caldav 토큰 뒤 하위 경로는 유지한다', () => {
        expect(maskSensitivePath('/caldav/super-secret-token/default/uid.ics')).toBe('/caldav/[REDACTED]/default/uid.ics')
    })

    test('spotify playing 토큰 세그먼트를 마스킹한다', () => {
        expect(maskSensitivePath('/api/spotify/playing/widget-token-abc')).toBe('/api/spotify/playing/[REDACTED]')
    })

    test('spotify playing 토큰 뒤 하위 경로는 유지한다', () => {
        expect(maskSensitivePath('/api/spotify/playing/widget-token-abc/widget')).toBe('/api/spotify/playing/[REDACTED]/widget')
        expect(maskSensitivePath('/api/spotify/playing/widget-token-abc/data')).toBe('/api/spotify/playing/[REDACTED]/data')
    })

    test('calendar ics 토큰 세그먼트를 마스킹한다', () => {
        expect(maskSensitivePath('/api/calendar/ics-token-xyz.ics')).toBe('/api/calendar/[REDACTED]')
    })

    test('calendar 의 예약 세그먼트는 마스킹하지 않는다', () => {
        expect(maskSensitivePath('/api/calendar/events')).toBe('/api/calendar/events')
        expect(maskSensitivePath('/api/calendar/events/1')).toBe('/api/calendar/events/1')
        expect(maskSensitivePath('/api/calendar/groups')).toBe('/api/calendar/groups')
        expect(maskSensitivePath('/api/calendar/subscription')).toBe('/api/calendar/subscription')
    })

    test('토큰이 없는 일반 경로는 그대로 둔다', () => {
        expect(maskSensitivePath('/api/mail/messages')).toBe('/api/mail/messages')
        expect(maskSensitivePath('/api/drive/assets/1')).toBe('/api/drive/assets/1')
        expect(maskSensitivePath('/policy')).toBe('/policy')
    })

    test('prefix 만 있고 세그먼트가 비면 그대로 둔다', () => {
        expect(maskSensitivePath('/api/calendar/')).toBe('/api/calendar/')
        expect(maskSensitivePath('/caldav')).toBe('/caldav')
    })
})
