import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { resetDiscordAlertBudget, sendDiscordAlert } from '../../lib/discord'

const WEBHOOK_URL = 'https://discord.test/webhook'

const alert = { service: 'b-hub-mail', errorCode: 'MAIL_PROVIDER_ERROR', severity: 40, errorDescription: '@everyone 확인', deviceId: null }

const originalFetch = globalThis.fetch

const stubFetch = (ok = true) => {
    const fetchMock = mock(() => Promise.resolve({ ok, status: ok ? 204 : 500 } as Response))
    globalThis.fetch = fetchMock as never
    return fetchMock
}

beforeEach(() => {
    resetDiscordAlertBudget()
})

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('sendDiscordAlert', () => {
    test('allowed_mentions 를 비워 멘션을 차단하고 timeout signal 을 전달한다', async () => {
        const fetchMock = stubFetch()

        await sendDiscordAlert(WEBHOOK_URL, alert)

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe(WEBHOOK_URL)
        expect(init.signal).toBeInstanceOf(AbortSignal)
        const body = JSON.parse(init.body as string)
        expect(body.allowed_mentions).toEqual({ parse: [] })
        expect(body.content).toContain('MAIL_PROVIDER_ERROR')
    })

    test('분당 전역 예산 20건을 넘으면 전송하지 않는다', async () => {
        const fetchMock = stubFetch()

        for (let i = 0; i < 20; i++) {
            expect(await sendDiscordAlert(WEBHOOK_URL, { ...alert, errorCode: `E_${i}` })).toBe(true)
        }
        expect(await sendDiscordAlert(WEBHOOK_URL, { ...alert, errorCode: 'E_OVER' })).toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(20)
    })

    test('웹훅이 실패 응답을 주면 EXTERNAL_API_ERROR 를 던진다', async () => {
        stubFetch(false)

        const thrown = await sendDiscordAlert(WEBHOOK_URL, alert).then(
            () => null,
            (error: unknown) => error,
        )
        expect((thrown as { code: string }).code).toBe('EXTERNAL_API_ERROR')
    })
})
