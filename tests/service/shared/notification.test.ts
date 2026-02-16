import { describe, expect, test, mock } from 'bun:test'
import { createNotificationService } from '../../../service/shared/notification'

describe('createNotificationService', () => {
    describe('sendDiscord', () => {
        test('성공 시 결과를 반환한다', async () => {
            const fetchFn = mock(() => Promise.resolve(new Response('', { status: 204 })))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            const result = await service.sendDiscord('https://discord.com/webhook', {
                content: 'Hello',
            })
            expect(result.success).toBe(true)
            expect(result.statusCode).toBe(204)
        })

        test('실패 시 에러 정보를 반환한다', async () => {
            const fetchFn = mock(() => Promise.resolve(new Response('', { status: 400 })))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            const result = await service.sendDiscord('https://discord.com/webhook', {
                content: 'Hello',
            })
            expect(result.success).toBe(false)
            expect(result.error).toBe('HTTP 400')
        })

        test('네트워크 에러를 처리한다', async () => {
            const fetchFn = mock(() => Promise.reject(new Error('Network error')))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            const result = await service.sendDiscord('https://discord.com/webhook', {
                content: 'Hello',
            })
            expect(result.success).toBe(false)
            expect(result.error).toBe('Network error')
        })
    })

    describe('sendWebhook', () => {
        test('성공 시 결과를 반환한다', async () => {
            const fetchFn = mock(() => Promise.resolve(new Response('', { status: 200 })))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            const result = await service.sendWebhook('https://hook.example.com', {
                data: 'test',
            })
            expect(result.success).toBe(true)
        })

        test('커스텀 헤더를 전송한다', async () => {
            const fetchFn = mock(() => Promise.resolve(new Response('', { status: 200 })))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            await service.sendWebhook('https://hook.example.com', { data: 'test' }, { 'X-Custom': 'value' })

            const callArgs = fetchFn.mock.calls[0] as [string, RequestInit]
            const headers = callArgs[1].headers as Record<string, string>
            expect(headers['X-Custom']).toBe('value')
        })

        test('에러 시 처리한다', async () => {
            const fetchFn = mock(() => Promise.reject(new Error('timeout')))
            const service = createNotificationService({
                fetchFn: fetchFn as typeof fetch,
            })

            const result = await service.sendWebhook('https://hook.example.com', {})
            expect(result.success).toBe(false)
            expect(result.error).toBe('timeout')
        })
    })
})
